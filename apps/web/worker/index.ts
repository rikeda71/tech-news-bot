import { Hono } from "hono";
import type { Env } from "./types";
import api from "./api/router";
import sitemap from "./api/sitemap";
import robots from "./api/robots";
import syndication from "./api/syndication";
import opml from "./api/opml";
import { rewriteShell } from "./api/spa-shell";
import { collectAll } from "./collector";
import { pickFeedSlot } from "./collector/slot";
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
      // fonts.googleapis.com の CSS は <link rel="stylesheet"> 経由で読み込むため style-src の対象
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
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
// /assets/* 以外の SPA ルートは rewriteShell で route ごとにメタタグを書き換える。
// /api/* と /assets/* はこのハンドラより前に処理されるため、ここに到達するのは SPA ルートのみ。
app.all("*", async (c) => {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith("/assets/")) {
    const res = await c.env.ASSETS.fetch(c.req.raw);
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
  }
  return rewriteShell(c.req.raw, c.env);
});

// 3 cron expression を slot 0/1/2 にマップする。Free plan の subrequest 上限 (50/invocation)
// を満たすため、enabled feed を 3 等分して各 slot で 1 グループだけ収集する。
// retention は slot 2 で 1 日 1 回だけ実行する。
const SLOT_BY_CRON: Record<string, 0 | 1 | 2> = {
  "0 16 * * *": 0,
  "30 16 * * *": 1,
  "0 17 * * *": 2,
};

const handler: ExportedHandler<Env> = {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    // READONLY=1 の preview 環境ではコレクターを起動しない
    if (env.READONLY === "1") {
      console.log("[scheduled] READONLY mode – skipping");
      return;
    }

    const slot = SLOT_BY_CRON[controller.cron];
    if (slot === undefined) {
      console.warn(`[scheduled] unknown cron expression: ${controller.cron}`);
      return;
    }

    const slotFeedIds = pickFeedSlot(slot, 3);
    console.log(`[scheduled] cron=${controller.cron} slot=${slot} feeds=${slotFeedIds.length}`);

    ctx.waitUntil(
      collectAll(env, { source: "cron", feedIds: slotFeedIds }).catch((err) => {
        console.error("[scheduled] collectAll failed", err);
      }),
    );

    // retention は最終 slot で 1 日 1 回だけ実行する。slot 2 = 17:00 UTC (JST 02:00)
    if (slot === 2) {
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
