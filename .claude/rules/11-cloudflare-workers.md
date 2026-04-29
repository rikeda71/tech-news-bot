---
paths:
  - "apps/web/worker/**/*.ts"
  - "apps/web/wrangler.toml"
  - "apps/web/worker-configuration.d.ts"
---

# Cloudflare Workers / wrangler 規約 (2026 年版)

## 無料枠の制約 (常に意識)

- **D1**: 5 GB / 5M reads/day / 100K writes/day / 50ms CPU per query
- **Workers**: 100K req/day / 10ms CPU per req (Cron / Queue は 30s)
- **Static Assets**: 100K req/day
- **R2 / KV (使用していないが将来用)**: 10 GB / 1M Class A ops / 10M Class B ops per month

## Env binding と型

- `wrangler.toml` の `[[d1_databases]]` / `[vars]` / `[assets]` を変えたら必ず `pnpm cf-typegen` を実行し、`worker-configuration.d.ts` を再生成する
- `Env` 型は `apps/web/worker/types.ts` で `interface Env extends Cloudflare.Env { ... }` として拡張する。重複定義しない
- `vars` は plaintext。`secret` は `wrangler secret put` で別途登録 (例: `ADMIN_TOKEN`)
- `.dev.vars` ファイル (gitignore 済) はローカル secret 用

## fetch handler

- `default export` の `fetch(req, env, ctx)` は Hono に丸投げ:
  ```ts
  export default {
    fetch: app.fetch,
    scheduled,
  } satisfies ExportedHandler<Env>;
  ```
- `ctx.waitUntil(...)` で fire-and-forget 処理 (ログ送信、analytics 書き込み) を投げると、レスポンス返却後も実行が継続する
- `ctx.passThroughOnException()` を使えば例外時に origin にフォールバックできるが、本プロジェクトは origin がないので使わない

## scheduled (cron)

- `0 */3 * * *` で `scheduled()` → `collectAll()` を起動
- cron handler は **30 秒以内** に終わらせる (CPU 時間ではなく実時間)。並列度は `COLLECTOR_CONCURRENCY=4` (デフォルト)、`wrangler.toml` の `vars` で上書き可
- `event.scheduledTime` を使うとテスト時に時間注入できる

## 外部 fetch (collector)

- 必ず `AbortController` で timeout を設定。デフォルト 5 秒、テストでは `COLLECTOR_TIMEOUT_MS=500`
- `User-Agent` を `tech-news-bot/<version> (+https://...)` 形式で必ず設定 (`worker/collector/index.ts` の `fetchFeed` 参照)
- HTTP 4xx は記録だけして retry しない、5xx は backoff retry (最大 2 回)
- `If-None-Match` / `If-Modified-Since` を送って 304 を活用 (`migrations/0005_feed_conditional_headers.sql` で feed 別に保持)

## Static Assets

- ハッシュ付き `/assets/*` は `Cache-Control: immutable, max-age=31536000`
- HTML / SPA fallback は `Cache-Control: no-cache`
- assets binding `ASSETS.fetch(req)` で配信。明示的な fallback ハンドラは `index.ts` の最後で SPA ルートを `c.env.ASSETS.fetch(c.req.raw)` する

## D1 ベストプラクティス (このルールでも触れるが詳細は 13-d1-sql.md)

- **prepared statement のキャッシュ**: 同じ SQL 文字列を再利用すると Cloudflare が自動キャッシュする。動的 SQL を組み立てる時はクエリ形状を限定する
- **batch**: `c.env.DB.batch([stmt1, stmt2])` で複数文を 1 ラウンドトリップ
- **transaction**: D1 は明示 `BEGIN/COMMIT` でなく batch がトランザクションになる。`batch` 内のいずれかが失敗すると全体ロールバック
- **migrations dir**: ルートの `migrations/`。`wrangler.toml` で `migrations_dir = "../../migrations"` を相対指定

## Logging / Observability

- `console.log` は `wrangler tail` で見える。`wrangler tail --format=json` で構造化
- 本番では Workers Analytics Engine か Logpush に飛ばすのが理想 (現在未実装)
- 機密情報を log しない: ADMIN_TOKEN、ユーザー入力をそのままログに流さない

## デプロイ

- 本番デプロイは GitHub Actions (`.github/workflows/deploy.yml`) 経由のみ。手動 `wrangler deploy` は禁止
- secrets は GitHub repository secrets に `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` を登録
- preview deployment が必要なら `wrangler deploy --env preview` だが現状は本番のみ
