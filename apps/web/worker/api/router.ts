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
import docs from "./docs";

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

const PUBLIC_PATHS = ["/articles/*", "/categories/*", "/feeds/*", "/stats/*", "/health/*"] as const;
for (const path of PUBLIC_PATHS) {
  api.use(path, allowedOriginsCors);
}

api.route("/articles", articles);
api.route("/categories", categories);
api.route("/feeds", feeds);
api.route("/health", health);
api.route("/stats", stats);
api.route("/admin", admin);
api.route("/", docs);

export default api;
