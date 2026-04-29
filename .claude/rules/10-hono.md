---
paths:
  - "apps/web/worker/api/**/*.ts"
  - "apps/web/worker/index.ts"
  - "apps/web/worker/middleware/**/*.ts"
---

# Hono コーディング規約 (2026 年版ベストプラクティス)

Hono v4 系を前提とする (現在 `hono@4.12+`)。

## ルーティング構造

- ルートエントリは `apps/web/worker/index.ts`。各 `/api/<area>` ルーターは `apps/web/worker/api/<area>.ts` で定義し、index 側で `app.route("/api/articles", articlesRoute)` のようにマウント
- 1 ファイル 1 ルーター。`articles.ts` / `stats.ts` / `feeds.ts` / `health.ts` / `admin.ts` / `syndication.ts` の単位を維持
- `/api/admin/*` は `Bearer <ADMIN_TOKEN>` 必須。`admin.ts` の冒頭で middleware として token check を行う (タイミング攻撃を避けるため定数時間比較)

## Context (`c`) の扱い

- Worker の `Env` を `Hono<{ Bindings: Env }>` として伝播させる。`c.env.DB` の型が補完される
- `c.var` は middleware から下流に値を渡す唯一の手段。直接プロパティを生やさない:

  ```ts
  app.use("*", async (c, next) => {
    c.set("requestId", crypto.randomUUID());
    await next();
  });
  ```

  型は `Hono<{ Bindings: Env; Variables: { requestId: string } }>` に追加する

## レスポンス

- JSON は `c.json(payload, status)` を使う。手書きの `new Response(JSON.stringify(...))` は避ける
- ステータスコード規約:
  - 200 = 成功、201 = 作成成功、204 = 成功 / body なし
  - 400 = 入力バリデーションエラー、401 = 認証なし、403 = 権限不足、404 = 該当なし、429 = レート制限
  - 500 = サーバー内部エラー (catch した unknown はここに集約)
- エラーレスポンスは形を統一: `{ error: string, code?: string, detail?: string }`
- 大きな JSON (> 100 KB) は cursor 方式で分割 (`/api/articles` 参照)。ETag を付与してクライアントの再取得を抑制
- ストリーミングが必要な場合は `c.stream(...)` または `c.streamText(...)` を使う

## バリデーション

- 軽量パースは `c.req.query("limit")` を `Number()` に通して NaN を弾く程度で OK
- 構造化バリデーションは `@hono/zod-validator` を入れて `zValidator("query", schema)` を使う (新規導入時は要パッケージ追加)
- URL パラメータは常に文字列なので `Number()` / `Boolean()` での明示変換を忘れない

## Middleware

- 順序は `index.ts` の上から下に評価される
- 推奨順序: CORS → request-id → logger → auth (admin only) → route
- `cors()` は `hono/cors` から import。`origin` は環境変数 (`ALLOWED_ORIGINS`) で切り替え
- `etag()` は `hono/etag` から。`/api/articles` のような GET レスポンスに有効

## 例外処理

- グローバル `app.onError((err, c) => ...)` を index.ts に必ず定義
- catch した `err` は `unknown`。`HTTPException` (Hono 公式) と一般エラーを分けて処理
- 5xx は `c.env.SENTRY_DSN` が設定されていれば送信 (現状未実装、将来用)

## RPC / 型共有

- 現プロジェクトでは worker と client で型を共有していない (`apps/web/client/types/api.ts` で別定義)
- 将来 RPC 型共有を導入するなら Hono の RPC ヘルパーを使い、`apps/web/worker/api/index.ts` で `app.route(...)` の戻り値の `type AppType = typeof app` を export → client から `import type { AppType }` で typed `hc<AppType>(...)` を作る

## パフォーマンス

- D1 prepared statement は handler の中ではなく **モジュールスコープで `c.env.DB.prepare(SQL)` する… のは不可** (env が無い)。代わりに `db/articles.ts` のような層で関数化し、Cloudflare の statement キャッシュに任せる
- 1 リクエストで複数 D1 クエリを投げるなら `c.env.DB.batch([stmt1, stmt2])` でラウンドトリップを 1 回に
- ホットパスで `JSON.stringify` の呼び出しを必要以上にしない (`c.json` が内部でやる)
