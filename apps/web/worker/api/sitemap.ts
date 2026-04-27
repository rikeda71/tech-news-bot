import { Hono } from "hono";
import type { Env } from "../types";
import { loadEnabledFeeds } from "../feed-config";

const app = new Hono<{ Bindings: Env }>();

function escapeXml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSitemap(origin: string): string {
  const feeds = loadEnabledFeeds();

  const staticUrls = [
    [
      `<url>`,
      `<loc>${escapeXml(origin)}/</loc>`,
      `<changefreq>hourly</changefreq>`,
      `<priority>1.0</priority>`,
      `</url>`,
    ].join(""),
    [
      `<url>`,
      `<loc>${escapeXml(origin)}/api/openapi.json</loc>`,
      `<priority>0.3</priority>`,
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
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(xml);
});

export default app;
