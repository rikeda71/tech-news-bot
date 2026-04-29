# tools/d1-client

D1 からデータを抽出する Node.js CLI スクリプト群。Claude skills から呼び出すことを想定している。

実行前提:

- `pnpm` がインストール済み
- `apps/web/wrangler.toml` に D1 バインディングが設定済み
- `--target=remote` の場合は以下のいずれかで認証済み:
  - `pnpm --filter @tnb/web exec wrangler login` (対話ログイン)
  - または環境変数 `CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_API_TOKEN` を設定 (CI/script 用)

## recent.mjs — 期間ベースで記事を取得

期間 + カテゴリ等でフィルタした記事を返す。`tech-news-digest` / `tech-news-weekly` skill が使用する。

```sh
node tools/d1-client/recent.mjs --since=<today|week|month|N> [options]
```

| オプション   | デフォルト | 説明                                                                              |
| ------------ | ---------- | --------------------------------------------------------------------------------- |
| `--since`    | (必須)     | `today` / `week` / `month` / `N`                                                  |
| `--target`   | `local`    | `local` または `remote`                                                           |
| `--category` | なし       | `bigtech` / `ai` / `jp` / `zenn`。カンマ区切りで複数指定可 (例: `bigtech,ai,jp`) |
| `--lang`     | なし       | `ja` または `en`                                                                  |
| `--limit`    | `200`      | 最大取得件数 (上限 1000 — D1 の 1 invocation あたり 50 queries 制限に基づく実装上限) |

例:

```sh
node tools/d1-client/recent.mjs --since=today --target=remote
node tools/d1-client/recent.mjs --since=week --category=ai --target=remote
node tools/d1-client/recent.mjs --since=today --category=bigtech,ai,jp --target=remote
```

出力 JSON:

```json
{
  "since": "2026-04-26T05:00:00.000Z",
  "target": "remote",
  "filters": { "category": null, "lang": null },
  "total": 42,
  "articles": [...],
  "by_category": { "ai": 12, "bigtech": 18, "jp": 8, "zenn": 4 },
  "by_feed": { "zenn-trending": 3 },
  "by_lang": { "en": 30, "ja": 12 }
}
```

## search.mjs — キーワード全文検索で記事を取得

FTS5 (trigram tokenizer, `migrations/0003_fts5_trigram.sql` で設定) を使ってキーワード検索した記事を返す。`tech-news-search` skill が使用する。

```sh
node tools/d1-client/search.mjs --q=<keyword> [options]
```

| オプション   | デフォルト | 説明                             |
| ------------ | ---------- | -------------------------------- |
| `--q`        | (必須)     | 検索キーワード                   |
| `--since`    | `month`    | `today` / `week` / `month` / `N` |
| `--target`   | `local`    | `local` または `remote`          |
| `--category` | なし       | `bigtech` / `ai` / `jp` / `zenn` |
| `--lang`     | なし       | `ja` または `en`                 |
| `--limit`    | `100`      | 最大取得件数 (上限 1000)         |

例:

```sh
node tools/d1-client/search.mjs --q="MCP" --since=month --target=local
node tools/d1-client/search.mjs --q="Rust" --since=week --category=jp --target=remote
node tools/d1-client/search.mjs --q="LLM inference" --since=month --lang=en --target=remote
```

出力 JSON:

```json
{
  "q": "MCP",
  "since": "2026-03-28T05:00:00.000Z",
  "target": "local",
  "filters": { "category": null, "lang": null },
  "total": 18,
  "articles": [...],
  "by_category": { "ai": 8, "zenn": 6, "bigtech": 3, "jp": 1 },
  "by_feed": { "zenn-trending": 5 },
  "by_lang": { "ja": 10, "en": 8 }
}
```
