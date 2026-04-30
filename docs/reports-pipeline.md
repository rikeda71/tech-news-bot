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
/tmp/report.md, /tmp/report-meta.json, /tmp/slack-message.md
   ↓ 4. curl POST /api/admin/reports (Bearer ADMIN_TOKEN)
Worker (Hono)
   ↓ 5. upsertReport → レスポンス { ok, id } を /tmp/post-resp.json に保存
D1 (本番) ── reports
   ↓ 6. GH Actions → Slack (Bot Token + chat.postMessage API でスレッド投稿: 親=タイトル+重要度 / 子=本文)
Slack
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
  "category": null,                   // null | "bigtech" | "ai" | "jp" | "personal"
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

| File                 | スケジュール (UTC) | スケジュール (JST) | 起動する skill     | skill 引数                                                              |
| -------------------- | ------------------ | ------------------ | ------------------ | ----------------------------------------------------------------------- |
| `report-daily.yml`   | `0 22 * * *`       | 毎日 07:00         | `tech-news-digest` | `since=today, deep, categories=bigtech+ai+jp (3 回呼び), personal 除外` |
| `report-weekly.yml`  | `0 22 * * 0`       | 毎週月曜 07:00     | `tech-news-weekly` | `since=week, categories=bigtech+ai (2 回呼び)`                          |
| `report-monthly.yml` | `0 22 1 * *`       | 毎月 2 日 07:00    | `tech-news-weekly` | `since=month, limit=500, categories=bigtech+ai (2 回呼び)`              |

> monthly は GitHub Actions cron が `L` (月末) を非対応のため、「翌月 2 日 JST 07:00 に
> 過去 30 日を集計」として暦月とほぼ等価のレポートを作る。`since=month` は skill 仕様で
> 過去 30 日を意味する (暦月ぴったりではない)。

### Workflow の構造 (共通)

1. `actions/checkout` + `pnpm/action-setup` + `actions/setup-node` + `pnpm install`
2. `anthropics/claude-code-base-action@beta`
   - `claude_code_oauth_token`: subscription 経由で発行された OAuth token
   - `allowed_tools`: `"Bash,Read,Write,WebFetch,Skill"`
   - env: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (recent.mjs が wrangler 経由で D1 にアクセスする際に必要)
   - prompt: skill 起動 + `/tmp/report.md` / `/tmp/report-meta.json` / `/tmp/slack-message.md` への書き出しを指示
3. `jq` で markdown と meta JSON を 1 つの payload にまとめ、`curl POST /api/admin/reports` で Worker に投入 (レスポンスを `/tmp/post-resp.json` に保存)
4. `Post to Slack (threaded)` ステップで Slack Bot Token + `chat.postMessage` API を使い、親メッセージ (タイトル + 重要度) を投稿後、`thread_ts` を取得して本文を thread にぶら下げる

**カテゴリ複数取得パターン**: `recent.mjs` はカンマ区切り複数指定に非対応のため、カテゴリごとに呼んで URL で de-dup する:

```
daily   : --category=bigtech, --category=ai, --category=jp を各 1 回 → 3 結果をマージ → URL de-dup
weekly  : --category=bigtech, --category=ai を各 1 回 → 2 結果をマージ → URL de-dup
monthly : --category=bigtech --limit=500, --category=ai --limit=500 を各 1 回 → 2 結果をマージ → URL de-dup
```

meta_json の `included_categories` にカバーしたカテゴリ配列を記録する (Worker 側 schema 変更なし、`meta_json` 任意 JSON)。

### concurrency

各 workflow に `concurrency: { group: report-<kind>, cancel-in-progress: false }` を
付け、手動 dispatch と cron が重なってもキューイングする (途中で止めない)。

---

## GitHub Secrets

repository secrets に以下を登録する。

| Secret                    | 用途                                                           | 取得元                                                            |
| ------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------- |
| `CLAUDE_CODE_OAUTH_TOKEN` | `claude-code-base-action` の認証 (subscription 経由)           | `claude /install-github-app` で発行                               |
| `WORKER_ADMIN_TOKEN`      | `/api/admin/reports` の Bearer 認証                            | `openssl rand -hex 32` などで生成 (GH 側で管理)                   |
| `CLOUDFLARE_API_TOKEN`    | `wrangler d1 execute --remote` を打つために必要                | Cloudflare dashboard → API Tokens                                 |
| `CLOUDFLARE_ACCOUNT_ID`   | wrangler の account 自動選択                                   | Cloudflare dashboard                                              |
| `SLACK_BOT_TOKEN`         | report workflow の Slack スレッド投稿 (`chat.postMessage` API) | Slack App 管理画面 → OAuth & Permissions → Bot Token (`xoxb-...`) |
| `SLACK_CHANNEL_ID`        | report workflow の投稿先 channel ID                            | Slack channel の URL または右クリック → Copy link から取得        |

`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` は既に deploy workflow で使っている
ものを流用できる。

`WORKER_ADMIN_TOKEN` は **GitHub Actions secret 側を single source of truth** として扱う。
deploy workflow に "Sync admin secret to Worker" ステップが入っていて、
`wrangler secret put ADMIN_TOKEN` で Worker secret 側に同値を流し込む。
これにより GH と Cloudflare の 2 箇所に同じ値を二重登録する手間を省ける。
ローテーションするときも GH 側の値を更新して deploy を回せば Worker secret も自動的に追随する。

---

## 運用手順

### 初回セットアップ

1. `CLAUDE_CODE_OAUTH_TOKEN` / `WORKER_ADMIN_TOKEN` を GitHub Actions secrets に登録
   - `WORKER_ADMIN_TOKEN`: `openssl rand -hex 32 | gh secret set WORKER_ADMIN_TOKEN` などでランダム生成して登録する。Worker 側 secret は次の deploy で自動同期される
2. PR を merge し本番 deploy を回す (deploy workflow が migration 0010 を適用 + `WORKER_ADMIN_TOKEN` を Worker の `ADMIN_TOKEN` secret に同期)
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
2. prompt の `category 指定なし` を `category=<bigtech|ai|jp>` に変更 (`personal` はレポート対象外)
3. meta JSON の `category` を該当カテゴリ名に変更

UNIQUE index が `(kind, period, category)` で張られているため、category 違いは別行として
共存する (上書きされない)。

### トラブルシュート

| 症状                            | 確認ポイント                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Skill ステップで 401            | `CLAUDE_CODE_OAUTH_TOKEN` が失効していないか                                                             |
| `recent.mjs` が 0 件            | `CLOUDFLARE_API_TOKEN` の権限 / `CLOUDFLARE_ACCOUNT_ID`                                                  |
| `/api/admin/reports` が 401     | `WORKER_ADMIN_TOKEN` (GH) と Worker 側 `ADMIN_TOKEN` secret が同値か (deploy ジョブで sync 済みかも確認) |
| `/api/admin/reports` が 400     | content 空 / ISO 8601 不正 / category 範囲外。step 出力の error を読む                                   |
| `/tmp/report.md` が生成されない | skill が Stage 4 まで到達していない。prompt のログを確認                                                 |

---

## Slack 通知

Slack への投稿は Worker ではなく GitHub Actions 側で行う。
Slack Bot Token + `chat.postMessage` API を使い、**スレッド化した 2 段構成**で投稿する。

1. Skill (Claude Code) が `/tmp/slack-message.md` を生成 (Slack mrkdwn 形式、30000 文字以内)
2. `Save report to D1` ステップで POST レスポンス (`{ ok, id }`) を `/tmp/post-resp.json` に保存
3. `Post to Slack (threaded)` ステップが 2 段階の `chat.postMessage` を実行:
   - **Step A (親メッセージ)**: タイトル + 重要度を header/context block で投稿。レスポンスの `.ts` を取得
   - **Step B (子メッセージ)**: 取得した `ts` を `thread_ts` に指定し、`slack-message.md` を chunks に分割して thread にぶら下げる

特性:

- `SLACK_BOT_TOKEN` または `SLACK_CHANNEL_ID` が未設定の場合は no-op でスキップ (投稿しないだけで workflow は正常終了)
- `continue-on-error: true` を付けているため、Slack 投稿が失敗しても workflow 全体が fail しない
- bot token リテラルをコードに埋め込まない。`${{ secrets.SLACK_BOT_TOKEN }}` 経由でのみ参照する
- **bot を channel に invite する必要がある**: Slack ワークスペースで `/invite @<bot名>` を投稿先 channel で実行しないと `not_in_channel` エラーになる

### 設定方法

```bash
# Slack App を作成して Bot Token (xoxb-...) を取得し登録する
gh secret set SLACK_BOT_TOKEN
# プロンプトに xoxb-... トークンを入力

# SLACK_CHANNEL_ID の取得: Slack channel の URL または右クリック → Copy link から取得
gh secret set SLACK_CHANNEL_ID

# Slack App に chat:write スコープを付与し、bot を channel に invite:
# Slack ワークスペース内で /invite @<bot名> を該当 channel で実行
```

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
