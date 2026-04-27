---
name: tech-news-search
description: 特定キーワードで D1 の記事を深掘り検索する skill。"MCP の最近の話題は？" "Rust の記事まとめて" のように特定キーワードで絞り込みたい時に起動する。期間 + カテゴリ + キーワードで FTS5 全文検索し、関連性の高い記事を選定して 2〜3 段落の解説を返す。
---

# tech-news-search

## 他の skill との使い分け

- **tech-news-digest**: 今日・今週・任意期間の記事を素早くリスト形式でまとめる。特定キーワードでなく「期間」で見たい場合はこちら。
- **tech-news-weekly**: 週次・月次を「読み物」として仕上げる。ニュースレター的な narrative が必要な場合はこちら。
- **tech-news-search (本 skill)**: 特定キーワードで深掘り検索。「MCP とは？」「最近の Rust 記事」「LLM inference の話題」のような問い合わせに最適。

## やること

D1 の FTS5 (`articles_fts`, trigram tokenizer) で全文検索し、3 ステージで日本語の深掘り解説を生成する。

## 手順

### Stage 1: Collect — FTS5 で記事を取得

`tools/d1-client/search.mjs` を Node から実行する。

引数:

- `--q=<keyword>` (必須) — 検索キーワード。複数単語はスペース区切りで `"AI agent"` のようにクォート
- `--since=<today|week|month|N>` (デフォルト `month`) — 対象期間
- `--target=<local|remote>` (省略時 `local`)
- `--category=<bigtech|ai|jp|zenn>` (任意)
- `--lang=<ja|en>` (任意)
- `--limit=<N>` (デフォルト 100)

実行例:

```sh
node tools/d1-client/search.mjs --q="MCP" --since=month --target=remote
node tools/d1-client/search.mjs --q="Rust" --since=week --category=jp --target=remote
node tools/d1-client/search.mjs --q="LLM inference" --since=month --lang=en --target=remote
```

stdout に出る JSON 形式:

```json
{
  "q": "MCP",
  "since": "2026-03-28T05:00:00.000Z",
  "target": "remote",
  "filters": { "category": null, "lang": null },
  "total": 18,
  "articles": [
    {
      "id": 456,
      "guid": "...",
      "feed_id": "zenn-trending",
      "feed_name": "Zenn トレンド",
      "title": "MCP で Claude が何でもできるようになった話",
      "url": "https://zenn.dev/...",
      "summary": "<= 500 char excerpt>",
      "author": "...",
      "published_at": "2026-04-20T...",
      "category": "zenn",
      "lang": "ja"
    }
  ],
  "by_category": { "ai": 8, "zenn": 6, "bigtech": 3, "jp": 1 },
  "by_feed": { "zenn-trending": 5 },
  "by_lang": { "ja": 10, "en": 8 }
}
```

**URL による de-dup (Zenn 対策)**:

Stage 1 完了後、`articles` を `url` でグループ化し、重複 URL は最も古い `published_at` のものを 1 件だけ残す:

```js
const seen = new Map();
const deduped = [];
for (const a of articles.sort((x, y) => x.published_at.localeCompare(y.published_at))) {
  if (!seen.has(a.url)) {
    seen.set(a.url, true);
    deduped.push(a);
  }
}
```

エラーハンドリング:

- `total === 0` の場合: 「該当記事なし」と正直に報告する。creative writing で埋めない。別のキーワードや期間を提案する
- `--target=remote` で 401/403 → `pnpm --filter @tnb/web exec wrangler login` を案内
- `--target=local` で 0 件 → `pnpm migrate:local` + `pnpm dev` でローカル収集を 1 回回すよう案内

### Stage 2: Triage — 関連性で記事を選定

de-dup 後の `articles` を読み、検索キーワードとの関連性で **5〜10 件**を選定する。

選定基準:

1. **関連性**: タイトル・summary にキーワードが直接含まれる、もしくは意味的に近い記事を優先
2. **多様性**: 同一フィード・同一ホストからの記事が集中しないようにバランスを取る
3. **新しさ**: 同等の関連性なら `published_at` が新しい方を優先
4. **インパクト**: プロダクト GA・breaking change・重要な知見などを優先

`total > 50` の場合は category ごとに 3〜5 件まで絞ってからマージする。

選定理由を 1 行内部メモして次ステージに渡す。

**webfetch_blocklist** — 以下のホストは WebFetch 対象から除外し、`summary` ベースで処理する (`(summary based)` を付記):

| ホスト       | 理由                                             |
| ------------ | ------------------------------------------------ |
| `openai.com` | Cloudflare Bot Management により WebFetch が 403 |
| `medium.com` | paywall / ログイン wall で本文取得不可           |

除外判定は `new URL(article.url).hostname` で行う。

### Stage 3: Synthesize — キーワードの深掘り解説を生成

Stage 2 で選定した記事の `url` を WebFetch で取得し、キーワードに関する深掘り解説を生成する。

**同一ホストへの連続 fetch は行わない**。ホスト別にバッチを組み、各バッチを並列 fetch し、バッチ間では別ホストのバッチを挟む:

```
バッチ計画例 (3 ホスト、各 2 記事):
  batch[github.com]   → batch[zenn.dev]   → batch[aws.amazon.com]
  ↓ parallel          ↓ parallel           ↓ parallel
  [gh-1, gh-2]        [zenn-1, zenn-2]     [aws-1, aws-2]
```

注意:

- WebFetch が失敗した記事は `summary` から要約し末尾に `(summary based)` を付ける
- 動画 / PDF / login wall は WebFetch せず `summary` で処理

解説の内容 (2〜3 段落):

1. **現状**: キーワードが示す技術・概念の現在の発展段階、主要プレイヤー、議論されている用途
2. **動向**: 取得した記事から読み取れる最近のトレンド・変化の方向性
3. **注目点**: 競合トピック・論点・コミュニティの温度感

## 出力フォーマット

```md
# Tech News Search — "<キーワード>"

期間: <ISO start> 〜 <ISO end> / 検索ヒット (de-dup 後): <total> 件 / カテゴリ: bigtech=N, ai=N, jp=N, zenn=N

## 深掘り解説

<2〜3 段落の日本語解説。関連記事を [タイトル](url) 形式で自然に埋め込む>

## 関連記事ピックアップ (N 件)

- **[<タイトル>](url)** _(<feed_name>, <category>, <YYYY-MM-DD>)_ — <1〜2 文の日本語要約> <(summary based) があれば末尾に>
- ...

## カテゴリ別件数

| Category | 件数 |
| -------- | ---- |
| bigtech  | N    |
| ai       | N    |
| jp       | N    |
| zenn     | N    |
```

## ガードレール

- **結果 0 件**: 「該当キーワードの記事なし」と正直に報告する。creative writing で埋めない。別のキーワード・期間・`--target=remote` での再試行を提案する
- **PII / 機密情報**: author 名以外の個人情報が混ざっていたら出力から除外する
- **D1 接続失敗**:
  - `--target=remote` で 401/403 → `pnpm --filter @tnb/web exec wrangler login` を案内
  - `--target=local` で 0 件 → `pnpm migrate:local` + `pnpm dev` でローカル収集を 1 回回すよう案内
- **WebFetch 連続失敗**: 選定記事の半数以上が fetch 失敗したら、残りは `summary` ベースに退避し、出力末尾に `_注: WebFetch が複数失敗したため一部 summary ベース_` を付ける

## 関連ファイル

- 実装: `tools/d1-client/search.mjs`
- 参考: `tools/d1-client/recent.mjs` (period-based retrieval)
- スキーマ: `migrations/0001_initial.sql` (`articles`, `feeds` テーブル)
- FTS5 設定: `migrations/0003_fts5_trigram.sql` (trigram tokenizer)
- 型: `apps/web/worker/types.ts` (`Article`, `FeedConfig` interface)
- 関連 skill: `.claude/skills/tech-news-digest/SKILL.md` (期間ベースのダイジェスト)
- 関連 skill: `.claude/skills/tech-news-weekly/SKILL.md` (週次・月次レポート)
