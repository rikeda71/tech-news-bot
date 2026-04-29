import { Hono } from "hono";
import type { Env } from "../types";
import { loadEnabledFeeds } from "../feed-config";

const app = new Hono<{ Bindings: Env }>();

function escapeXml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSitemap(origin: string): string {
  const feeds = loadEnabledFeeds();

  // /api/openapi.json は JSON API ドキュメントであり HTML コンテンツではないため
  // サイトマップのクロール対象から除外してクロールバジェットを節約する
  const staticUrls = [
    [
      `<url>`,
      `<loc>${escapeXml(origin)}/</loc>`,
      `<changefreq>hourly</changefreq>`,
      `<priority>1.0</priority>`,
      `</url>`,
    ].join(""),
  ];

  const feedUrls = feeds.map((f) =>
    [
      `<url>`,
      `<loc>${escapeXml(origin)}/?feed_id=${escapeXml(f.id)}</loc>`,
      `<changefreq>daily</changefreq>`,
      `<priority>0.6</priority>`,
      `</url>`,
    ].join(""),
  );

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` +
    staticUrls.join("") +
    feedUrls.join("") +
    `</urlset>`
  );
}

app.get("/sitemap.xml", (c) => {
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;
  const xml = buildSitemap(origin);
  c.header("Content-Type", "application/xml; charset=utf-8");
  // feeds.yaml は静的なためエッジキャッシュを積極活用する。
  // stale-while-revalidate でキャッシュ切れ後も裏でリフレッシュしつつ即返せる。
  c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  return c.body(xml);
});

export default app;
