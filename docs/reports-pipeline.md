# 自動レポート pipeline

GitHub Actions 上で `tech-news-*` skill を定期実行し、生成された markdown レポートを D1 (`reports` テーブル) に保存する仕組み。

設計の経緯と詳細は issue #270 を参照。

---

## 全体像

```
GitHub Actions (cron / workflow_dispatch)
   ↓ 1. skill 起動 (anthropics/claude-code-base-action@v1)
Claude Code
   ↓ 2. tools/d1-client/recent.mjs --target=remote で記事取得
D1 (本番) ── articles
   ↓ 3. WebFetch で本文取得 + markdown 生成
/tmp/report.md, /tmp/report-meta.json
   ↓ 4. curl POST /api/admin/reports (Bearer ADMIN_TOKEN)
Worker (Hono)
   ↓ 5. upsertReport
D1 (本番) ── reports
```

Worker の cron trigger は無料枠で 1 個までしか持てない (#230 の collector で消費済み) ため、
GitHub Actions 側で cron スケジュールを持たせる方針にしている。Claude Code subscription を
使うため `claude-code-base-action` の `claude_code_oauth_token` を利用する (Anthropic API key 不要)。

---

## D1 スキーマ

`migrations/0010_reports.sql` を参照。

```sql
CREATE TABLE reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL CHECK (kind IN ('daily', 'weekly', 'monthly')),
  period_start  TEXT NOT NULL,
  period_end    TEXT NOT NULL,
  category      TEXT,                -- NULL = 全カテゴリ
  lang          TEXT,                -- NULL = 全言語
  content       TEXT NOT NULL,       -- markdown 本体
  meta_json     TEXT,                -- dedup_total / by_category / by_feed など
  source_skill  TEXT NOT NULL,       -- "tech-news-digest" など
  generated_at  TEXT NOT NULL        -- ISO 8601
);
```

### UNIQUE index と NULL 扱い

SQLite では NULL は UNIQUE 制約上 distinct 扱いになるため、`(kind, period, NULL)` の重複が
通ってしまう。これを避けるために UNIQUE index は `COALESCE(category, '__all__')` 形で
張り、ON CONFLICT 句にも同じ式を指定する。

```sql
CREATE UNIQUE INDEX idx_reports_unique_period
  ON reports (
    kind, period_start, period_end,
    COALESCE(category, '__all__'),
    COALESCE(lang, '__all__')
  );
```

upsert はこの index に基づいて行われ、同期間 / 同カテゴリ / 同言語のレポートは何度
書き込んでも 1 行に収束する (= 再実行が idempotent)。

---

## 管理 API

`/api/admin/reports` は GitHub Actions からのみ叩かれる server-to-server エンドポイント。
CORS は付けず、Bearer `ADMIN_TOKEN` (rotation 中は `ADMIN_TOKEN_NEXT` も) で保護する。

| Method | Path                     | 用途                             |
| ------ | ------------------------ | -------------------------------- |
| POST   | `/api/admin/reports`     | レポートの upsert                |
| GET    | `/api/admin/reports`     | レポート一覧 (kind フィルタ可)   |
| GET    | `/api/admin/reports/:id` | content + meta_json まで含む詳細 |

### POST body

```jsonc
{
  "kind": "daily",                    // "daily" | "weekly" | "monthly"
  "period_start": "ISO 8601",
  "period_end":   "ISO 8601",
  "category": null,                   // null | "bigtech" | "ai" | "jp" | "zenn"
  "lang": null,                       // null | "ja" | "en"
  "content": "# Daily Tech News ...", // markdown 本体 (≤ 1MB)
  "meta": { "dedup_total": 42, ... }, // 任意 JSON (meta_json として保存)
  "source_skill": "tech-news-digest",
  "generated_at": "ISO 8601"
}
```

バリデーション:

- `content` は非空 / `MAX_CONTENT_BYTES = 1_000_000` 以下
- `category` / `lang` は許可リスト + `null`
- 各 ISO 8601 は `new Date(s).toISOString() === s` で round-trip チェック
- `READONLY=1` の場合は POST が 403

### Response

```jsonc
// POST
{ "ok": true, "id": 123 }

// GET (list)
{ "reports": [ { id, kind, period_start, ... }, ... ] }

// GET (detail)
{ "report": { ..., content, meta_json } }
```

詳細な type は `apps/web/worker/api/types.ts` の `AdminReport*Response` を参照。

---

## Workflow 一覧

各 workflow は `.github/workflows/` 配下に置く。

| File                 | スケジュール (UTC) | スケジュール (JST) | 起動する skill     | skill 引数               |
| -------------------- | ------------------ | ------------------ | ------------------ | ------------------------ |
| `report-daily.yml`   | `0 22 * * *`       | 毎日 07:00         | `tech-news-digest` | `since=today, deep`      |
| `report-weekly.yml`  | `0 22 * * 0`       | 毎週月曜 07:00     | `tech-news-weekly` | `since=week`             |
| `report-monthly.yml` | `0 22 1 * *`       | 毎月 2 日 07:00    | `tech-news-weekly` | `since=month, limit=500` |

> monthly は GitHub Actions cron が `L` (月末) を非対応のため、「翌月 2 日 JST 07:00 に
> 過去 30 日を集計」として暦月とほぼ等価のレポートを作る。`since=month` は skill 仕様で
> 過去 30 日を意味する (暦月ぴったりではない)。

### Workflow の構造 (共通)

1. `actions/checkout` + `pnpm/action-setup` + `actions/setup-node` + `pnpm install`
2. `anthropics/claude-code-base-action@v1`
   - `claude_code_oauth_token`: subscription 経由で発行された OAuth token
   - `allowed_tools`: `"Bash,Read,Write,WebFetch,Skill"`
   - env: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (recent.mjs が wrangler 経由で D1 にアクセスする際に必要)
   - prompt: skill 起動 + `/tmp/report.md` / `/tmp/report-meta.json` への書き出しを指示
3. `jq` で markdown と meta JSON を 1 つの payload にまとめ、`curl POST /api/admin/reports` で Worker に投入

prompt の本体例 (`report-daily.yml`):

```
tech-news-digest skill を以下の引数で起動してください:
- since=today
- mode=deep
- target=remote
- category 指定なし (全カテゴリ)
- lang 指定なし

Stage 1〜4 を完走したあと、最終的な markdown レポート全文を /tmp/report.md に
書き出してください。
合わせて meta JSON を /tmp/report-meta.json に書き出してください: { kind, period_start, ... }
```

### concurrency

各 workflow に `concurrency: { group: report-<kind>, cancel-in-progress: false }` を
付け、手動 dispatch と cron が重なってもキューイングする (途中で止めない)。

---

## GitHub Secrets

repository secrets に以下を登録する。

| Secret                    | 用途                                                 | 取得元                                            |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude-code-base-action` の認証 (subscription 経由) | `claude /install-github-app` で発行               |
| `ADMIN_TOKEN`             | `/api/admin/reports` の Bearer 認証                  | Worker secret と同値 (rotation 手順は別 doc 参照) |
| `CLOUDFLARE_API_TOKEN`    | `wrangler d1 execute --remote` を打つために必要      | Cloudflare dashboard → API Tokens                 |
| `CLOUDFLARE_ACCOUNT_ID`   | wrangler の account 自動選択                         | Cloudflare dashboard                              |

`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` は既に deploy workflow で使っている
ものを流用できる。

---

## 運用手順

### 初回セットアップ

1. PR を merge し本番 deploy が完了していること (migration 0010 が `pnpm migrate:prod` で適用済み)
2. `CLAUDE_CODE_OAUTH_TOKEN` / `ADMIN_TOKEN` を GitHub Actions secrets に登録
3. GitHub Actions UI から `Report Daily` を `workflow_dispatch` で手動実行
4. D1 に行が入ったか確認:

   ```bash
   pnpm exec wrangler d1 execute tech-news-bot-db --remote \
     --command 'SELECT id, kind, generated_at, length(content) AS bytes FROM reports ORDER BY id DESC LIMIT 5;'
   ```

### 再実行 (失敗した日のレポートを作り直す)

GitHub Actions UI から `workflow_dispatch` で再実行するだけで OK。
同じ `(kind, period_start, period_end, category, lang)` の組み合わせは upsert で上書きされる。

### カテゴリ別レポートを追加するとき

現状 daily / weekly / monthly はいずれも全カテゴリを対象にしている。`category=bigtech` 専用
レポートなどが欲しくなったら、既存 workflow をコピーして以下を変える:

1. ファイル名 / `name:` / `concurrency.group` を `report-<kind>-<category>.yml` 等に変更
2. prompt の `category 指定なし` を `category=<bigtech|ai|jp|zenn>` に変更
3. meta JSON の `category` を該当カテゴリ名に変更

UNIQUE index が `(kind, period, category)` で張られているため、category 違いは別行として
共存する (上書きされない)。

### トラブルシュート

| 症状                            | 確認ポイント                                                           |
| ------------------------------- | ---------------------------------------------------------------------- |
| Skill ステップで 401            | `CLAUDE_CODE_OAUTH_TOKEN` が失効していないか                           |
| `recent.mjs` が 0 件            | `CLOUDFLARE_API_TOKEN` の権限 / `CLOUDFLARE_ACCOUNT_ID`                |
| `/api/admin/reports` が 401     | `ADMIN_TOKEN` の値が Worker 側 secret と一致しているか                 |
| `/api/admin/reports` が 400     | content 空 / ISO 8601 不正 / category 範囲外。step 出力の error を読む |
| `/tmp/report.md` が生成されない | skill が Stage 4 まで到達していない。prompt のログを確認               |

---

## 関連ファイル

- `migrations/0010_reports.sql` — テーブル / index 定義
- `apps/web/worker/db/reports.ts` — D1 アクセス層 (upsert/list/get)
- `apps/web/worker/api/reports.ts` — Hono ハンドラ + バリデーション
- `apps/web/worker/api/router.ts` — `/admin/reports` のマウント
- `apps/web/worker/api/types.ts` — `AdminReport*Response`
- `apps/web/tests/worker/api/reports.test.ts` — 18 ケースの統合テスト
- `.github/workflows/report-daily.yml` — daily 用 cron workflow (`tech-news-digest`)
- `.github/workflows/report-weekly.yml` — weekly 用 cron workflow (`tech-news-weekly`)
- `.github/workflows/report-monthly.yml` — monthly 用 cron workflow (`tech-news-weekly --since=month`)
- `docs/operations/admin-token-rotation.md` — ADMIN_TOKEN ローテーション手順
