import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context, Next } from "hono";
import type { Env } from "../types";
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

const api = new Hono<{ Bindings: Env }>();

api.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

// /api/admin/* は server-to-server 専用のため CORS を付けない。
// それ以外の公開エンドポイントは wrangler.toml の CORS_ALLOWED_ORIGINS で制御する。
function allowedOriginsCors(c: Context<{ Bindings: Env }>, next: Next) {
  const origins = (c.env.CORS_ALLOWED_ORIGINS ?? "*").split(",").map((o) => o.trim());
  return cors({ origin: origins })(c, next);
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
// /admin/reports は別ハンドラに分離 (admin の中で /reports をルーティングしない設計)。
// Hono は path matching が前方一致でなく完全一致なので衝突しない。
api.route("/admin/reports", reports);
api.route("/admin", admin);
// 公開 reports endpoint: 認証不要で一覧・詳細を提供する
api.route("/reports", publicReports);
api.route("/", docs);

export default api;
