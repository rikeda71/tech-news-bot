import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context, Next } from "hono";
import type { Env } from "../types";
import { type AccessUser, accessJwtMiddleware } from "../middleware/access-jwt";
import articles from "./articles";
import categories from "./categories";
import feeds from "./feeds";
import health from "./health";
import stats from "./stats";
import admin from "./admin";
import reports from "./reports";
import publicReports from "./reports-public";
import docs from "./docs";
import { catalogHandler } from "./catalog";

const api = new Hono<{ Bindings: Env; Variables: { accessUser: AccessUser } }>();

api.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

// /api/admin/* は server-to-server 専用のため CORS を付けない。
// それ以外の公開エンドポイントは wrangler.toml の CORS_ALLOWED_ORIGINS で制御する。
// CORS_ALLOWED_ORIGINS が未設定または空文字列の場合は明示設定漏れを早期検知するため
// どの origin にもマッチさせず、ブラウザの cross-origin リクエストを拒否する。
function allowedOriginsCors(c: Context<{ Bindings: Env }>, next: Next) {
  const allowedOrigins = (c.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  return cors({
    origin: (origin) => {
      if (allowedOrigins.length === 0) return null;
      return allowedOrigins.includes(origin) ? origin : null;
    },
  })(c, next);
}

const PUBLIC_PATHS = [
  "/articles/*",
  "/categories/*",
  "/feeds/*",
  "/stats/*",
  "/health/*",
  "/reports/*",
] as const;
for (const path of PUBLIC_PATHS) {
  api.use(path, allowedOriginsCors);
}

// /api catalog — 他のルートより前に登録して確実に /api で捕捉する
api.get("/", catalogHandler);

api.route("/articles", articles);
api.route("/categories", categories);
api.route("/feeds", feeds);
api.route("/health", health);
api.route("/stats", stats);
// /admin/* には Cloudflare Access の JWT 検証を前段に挟む。
// SKIP_ACCESS_JWT="1" のときは bypass する (移行期 / ローカル開発)。
// admin.ts / reports.ts 内の Bearer ADMIN_TOKEN 検証は廃止せず並行運用する。
api.use("/admin/*", accessJwtMiddleware);
// /admin/reports は別ハンドラに分離 (admin の中で /reports をルーティングしない設計)。
// Hono は path matching が前方一致でなく完全一致なので衝突しない。
api.route("/admin/reports", reports);
api.route("/admin", admin);
// 公開 reports endpoint: 認証不要で一覧・詳細を提供する
api.route("/reports", publicReports);
api.route("/", docs);

export default api;
