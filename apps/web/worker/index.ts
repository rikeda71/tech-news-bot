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

// syndication / OPML / サイトマップは他サイトから fetch されるため cross-origin を許可する。
// それ以外は same-origin に絞り情報漏洩リスクを低減する。
function isCrossOriginAllowed(pathname: string): boolean {
  return (
    pathname === "/feed.json" ||
    pathname === "/feed.xml" ||
    pathname === "/feed.atom" ||
    pathname.startsWith("/feeds/") ||
    pathname === "/feeds.opml" ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt"
  );
}

// Security headers (全レスポンスに付与)
app.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  // HSTS: 本番 HTTPS のみで提供するため常に有効化。includeSubDomains は workers.dev サブドメインにも適用される。
  c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // COOP: top-level browsing context を分離し Spectre 系攻撃の cross-origin leak を防ぐ。
  c.header("Cross-Origin-Opener-Policy", "same-origin");
  // CORP: syndication / OPML はサードパーティ RSS リーダーから fetch されるため cross-origin を許可。
  // SPA / API は same-origin に絞ることで no-cors fetch による情報漏洩リスクを低減する。
  const pathname = new URL(c.req.url).pathname;
  if (isCrossOriginAllowed(pathname)) {
    c.header("Cross-Origin-Resource-Policy", "cross-origin");
  } else {
    c.header("Cross-Origin-Resource-Policy", "same-origin");
  }
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "img-src 'self' data: https:",
      // fonts.googleapis.com の CSS は <link rel="stylesheet"> 経由で読み込むため style-src の対象。
      // 'unsafe-inline' は React の style={{ ... }} prop と Vite が注入するインラインスタイルのために必要。
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
    // new Response(..., { headers }) でヘッダーを丸ごと置換すると global middleware が
    // c.header() で設定したセキュリティヘッダーが失われる。
    // 既存ヘッダーをコピーしてから Cache-Control のみ上書きすることでセキュリティヘッダーを保持する。
    const newRes = new Response(res.body, { status: res.status, statusText: res.statusText });
    res.headers.forEach((value, key) => newRes.headers.set(key, value));
    newRes.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    return newRes;
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
