# Cloudflare 運用ルール

- Cloudflare 無料枠での運用が前提。次の制約を意識する:
  - **D1**: 5 GB / 5M reads/day / 100K writes/day / 50ms CPU per query
  - **Workers**: 100K req/day / 10ms CPU per req (Cron は 30s)
  - **Static Assets**: 100K req/day
- Cron 起動時 (`scheduled`) の処理は `collectAll` 内で並列度 4 (`COLLECTOR_CONCURRENCY`) に制限。これを上げる場合 D1 書き込み TPS と CPU 時間に注意。
- 大きなレスポンスを返す API は ETag/cursor ベースで分割。今のところ `/api/articles` は `cursor` 方式。
- Worker から外部 fetch する際は必ず timeout (`AbortController`) と `User-Agent` を設定する (`worker/collector/index.ts` の `fetchFeed` 参照)。
- `wrangler.toml` の `vars` は plaintext 設定。secret は `wrangler secret put` で別途登録 (例: `ADMIN_TOKEN`)。
- Deploy は GitHub Actions 経由 (`.github/workflows/deploy.yml`)。手動 push は原則禁止。
