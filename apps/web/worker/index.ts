import { Hono } from "hono";
import type { Env } from "./types";
import api from "./api/router";
import sitemap from "./api/sitemap";
import robots from "./api/robots";
import syndication from "./api/syndication";
import opml from "./api/opml";
import { collectAll } from "./collector";
import { pruneOldArticles } from "./db/retention";
import { sendDailyDigest } from "./notify/slack-daily";

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
app.route("/", sitemap);
app.route("/", robots);
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
      console.log("[scheduled] READONLY mode – skipping");
      return;
    }

    // 3 時間ごとの cron (0 */3 * * *): RSS 収集
    ctx.waitUntil(
      collectAll(env).catch((err) => {
        console.error("[scheduled] collectAll failed", err);
      }),
    );

    const utcHour = new Date().getUTCHours();
    // UTC 00:00 (JST 09:00): Slack 日次ダイジェスト投稿
    if (utcHour === 0) {
      ctx.waitUntil(
        sendDailyDigest(env.DB, env.SLACK_WEBHOOK_URL).catch((err) => {
          console.error("[scheduled] sendDailyDigest failed", err);
        }),
      );
    }
    // Run retention once per day at UTC 18:00 (JST 03:00) — 低トラフィック帯。
    // cron `0 */6 * * *` は UTC 00,06,12,18 のみ起動するため 17 ではなく 18 に揃える。
    if (utcHour === 18) {
      ctx.waitUntil(
        pruneOldArticles(env.DB, Number(env.RETENTION_DAYS ?? "90")).then((r) => {
          console.log(`[retention] deleted=${r.deleted}`);
          return r;
        }),
      );
    }
  },
};

export default handler;
