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

| オプション   | デフォルト | 説明                                                                                 |
| ------------ | ---------- | ------------------------------------------------------------------------------------ |
| `--since`    | (必須)     | `today` / `week` / `month` / `N`                                                     |
| `--target`   | `local`    | `local` または `remote`                                                              |
| `--category` | なし       | `bigtech` / `ai` / `jp` / `zenn`。カンマ区切りで複数指定可 (例: `bigtech,ai,jp`)     |
| `--lang`     | なし       | `ja` または `en`                                                                     |
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

## reports.mjs — レポートの一覧・詳細・削除・重複検出

D1 の `reports` テーブルに保存された自動生成レポートを操作する。`tech-news-reports` skill が使用する。

```sh
node tools/d1-client/reports.mjs <list|show|delete|find-overlaps> [options]
```

### list — レポート一覧

```sh
node tools/d1-client/reports.mjs list [options]
```

| オプション | デフォルト | 説明                                                 |
| ---------- | ---------- | ---------------------------------------------------- |
| `--kind`   | なし       | `daily` / `weekly` / `monthly` で絞り込み            |
| `--from`   | なし       | ISO 8601 datetime。`generated_at >= from` でフィルタ |
| `--to`     | なし       | ISO 8601 datetime。`generated_at <= to` でフィルタ   |
| `--limit`  | `50`       | 最大取得件数 (上限 1000)                             |
| `--target` | `local`    | `local` または `remote`                              |

例:

```sh
node tools/d1-client/reports.mjs list --target=remote
node tools/d1-client/reports.mjs list --kind=weekly --target=remote
node tools/d1-client/reports.mjs list --kind=daily --from=2026-04-01T00:00:00Z --to=2026-04-30T23:59:59Z --target=remote
```

出力 JSON:

```json
{
  "target": "remote",
  "filters": { "kind": "weekly", "from": null, "to": null },
  "total": 3,
  "reports": [
    {
      "id": 5,
      "kind": "weekly",
      "period_start": "2026-04-21T00:00:00Z",
      "period_end": "2026-04-28T00:00:00Z",
      "category": null,
      "lang": "ja",
      "source_skill": "tech-news-weekly",
      "generated_at": "2026-04-28T06:00:00Z",
      "content_len": 4200
    }
  ]
}
```

### show — レポート詳細

```sh
node tools/d1-client/reports.mjs show <id> [--target=local|remote]
```

例:

```sh
node tools/d1-client/reports.mjs show 5 --target=remote
```

出力 JSON:

```json
{
  "target": "remote",
  "report": {
    "id": 5,
    "kind": "weekly",
    "period_start": "2026-04-21T00:00:00Z",
    "period_end": "2026-04-28T00:00:00Z",
    "category": null,
    "lang": "ja",
    "content": "...",
    "meta_json": null,
    "source_skill": "tech-news-weekly",
    "generated_at": "2026-04-28T06:00:00Z"
  }
}
```

### delete — レポート削除

デフォルトは dry-run。`--apply` を付けたときのみ実際に削除する。

```sh
node tools/d1-client/reports.mjs delete <id|id1,id2,...> [--target=local|remote] [--apply]
```

例:

```sh
# dry-run (対象確認)
node tools/d1-client/reports.mjs delete 5 --target=remote
# 複数 id
node tools/d1-client/reports.mjs delete 3,4,5 --target=remote
# 実際に削除
node tools/d1-client/reports.mjs delete 5 --target=remote --apply
```

出力 JSON:

```json
{
  "target": "remote",
  "dry_run": true,
  "requested_ids": [5],
  "found_ids": [5],
  "deleted_count": 0,
  "found_reports": [...]
}
```

### find-overlaps — 重複期間レポートの検出

同じ (kind, category, lang) 内で期間が重複するレポートのペアを検出する。

```sh
node tools/d1-client/reports.mjs find-overlaps [--kind=daily|weekly|monthly] [--target=local|remote]
```

例:

```sh
node tools/d1-client/reports.mjs find-overlaps --target=remote
node tools/d1-client/reports.mjs find-overlaps --kind=weekly --target=remote
```

出力 JSON:

```json
{
  "target": "remote",
  "total_pairs": 1,
  "overlaps": [
    {
      "a": {
        "id": 3,
        "kind": "weekly",
        "period_start": "2026-04-14T00:00:00Z",
        "period_end": "2026-04-21T00:00:00Z",
        "category": null,
        "lang": "ja",
        "source_skill": "tech-news-weekly",
        "generated_at": "2026-04-21T06:00:00Z"
      },
      "b": {
        "id": 4,
        "kind": "weekly",
        "period_start": "2026-04-17T00:00:00Z",
        "period_end": "2026-04-24T00:00:00Z",
        "category": null,
        "lang": "ja",
        "source_skill": "tech-news-weekly",
        "generated_at": "2026-04-24T06:00:00Z"
      }
    }
  ]
}
```

## search.mjs — キーワード全文検索で記事を取得

FTS5 (trigram tokenizer, `migrations/0003_fts5_trigram.sql` で設定) を使ってキーワード検索した記事を返す。`tech-news-search` skill が使用する。

```sh
node tools/d1-client/search.mjs --q=<keyword> [options]
```

| オプション   | デフォルト | 説明                                       |
| ------------ | ---------- | ------------------------------------------ |
| `--q`        | (必須)     | 検索キーワード (FTS5 特殊文字は除去される) |
| `--since`    | `month`    | `today` / `week` / `month` / `N`           |
| `--target`   | `local`    | `local` または `remote`                    |
| `--category` | なし       | `bigtech` / `ai` / `jp` / `zenn`           |
| `--lang`     | なし       | `ja` または `en`                           |
| `--limit`    | `100`      | 最大取得件数 (上限 1000)                   |

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
