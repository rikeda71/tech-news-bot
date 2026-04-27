import { Hono } from "hono";
import type { Env } from "./types";
import api from "./api/router";
import syndication from "./api/syndication";
import opml from "./api/opml";
import { collectAll } from "./collector";
import { pruneOldArticles } from "./db/retention";

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
app.route("/", opml);

// 静的アセットへのフォールバック (Cloudflare Static Assets binding)
// Vite は /assets/ 以下に hash 付きファイル名を出力するため、強キャッシュが安全。
// それ以外 (index.html / SPA fallback) は no-cache で常に最新を取得する。
app.all("*", async (c) => {
  const res = await c.env.ASSETS.fetch(c.req.raw);
  const url = new URL(c.req.url);
  const isHashed = url.pathname.startsWith("/assets/");
  const headers = new Headers(res.headers);
  headers.set(
    "Cache-Control",
    isHashed ? "public, max-age=31536000, immutable" : "no-cache, must-revalidate",
  );
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
});

const handler: ExportedHandler<Env> = {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    // READONLY=1 の preview 環境ではコレクターを起動しない
    if (env.READONLY === "1") {
      console.log("[scheduled] READONLY mode – skipping collectAll");
      return;
    }
    ctx.waitUntil(
      collectAll(env).catch((err) => {
        console.error("[scheduled] collectAll failed", err);
      }),
    );
    // Run retention once per day at UTC 17:00 to avoid peak write hours
    if (new Date().getUTCHours() === 17) {
      ctx.waitUntil(
        pruneOldArticles(env.DB, Number(env.RETENTION_DAYS ?? "0")).then((r) => {
          console.log(`[retention] deleted=${r.deleted}`);
          return r;
        }),
      );
    }
  },
};

export default handler;
