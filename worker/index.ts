import { Hono } from "hono";
import type { Env } from "./types";
import api from "./api/router";
import syndication from "./api/syndication";
import { collectAll } from "./collector";

const app = new Hono<{ Bindings: Env }>();

// Security headers (全レスポンスに付与)
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: https:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join("; "),
  );
});

app.route("/api", api);
app.route("/", syndication);

// 静的アセットへのフォールバック (Cloudflare Static Assets binding)
app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

const handler: ExportedHandler<Env> = {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      collectAll(env).catch((err) => {
        console.error("[scheduled] collectAll failed", err);
      }),
    );
  },
};

export default handler;
