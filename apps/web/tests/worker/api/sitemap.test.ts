import { describe, expect, it } from "vite-plus/test";
import { SELF } from "cloudflare:test";

describe("/robots.txt", () => {
  it("returns 200 with Content-Type text/plain", async () => {
    const res = await SELF.fetch("https://example.com/robots.txt");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, stale-while-revalidate=86400",
    );
  });

  it("contains User-agent: *", async () => {
    const res = await SELF.fetch("https://example.com/robots.txt");
    const text = await res.text();
    expect(text).toContain("User-agent: *");
  });

  it("contains Disallow: /api/admin/", async () => {
    const res = await SELF.fetch("https://example.com/robots.txt");
    const text = await res.text();
    expect(text).toContain("Disallow: /api/admin/");
  });

  it("contains Sitemap directive pointing to sitemap.xml", async () => {
    const res = await SELF.fetch("https://example.com/robots.txt");
    const text = await res.text();
    expect(text).toContain("Sitemap: https://example.com/sitemap.xml");
  });
});

describe("/sitemap.xml", () => {
  it("returns 200 with Content-Type application/xml", async () => {
    const res = await SELF.fetch("https://example.com/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, stale-while-revalidate=86400",
    );
  });

  it("contains root URL <loc>", async () => {
    const res = await SELF.fetch("https://example.com/sitemap.xml");
    const text = await res.text();
    expect(text).toContain("<loc>https://example.com/</loc>");
    expect(text).toContain("<priority>1.0</priority>");
    expect(text).toContain("<changefreq>hourly</changefreq>");
  });

  it("contains enabled feed_id URL (google-developers)", async () => {
    const res = await SELF.fetch("https://example.com/sitemap.xml");
    const text = await res.text();
    // feeds.yaml で enabled: true のフィードが含まれること
    expect(text).toContain("/?feed_id=google-developers");
    expect(text).toContain("<changefreq>daily</changefreq>");
    expect(text).toContain("<priority>0.6</priority>");
  });

  it("does not include /api/openapi.json (not a content page)", async () => {
    const res = await SELF.fetch("https://example.com/sitemap.xml");
    const text = await res.text();
    // API ドキュメントは HTML コンテンツではないのでクロールバジェット節約のため除外
    expect(text).not.toContain("/api/openapi.json");
  });

  it("is well-formed XML with urlset root element", async () => {
    const res = await SELF.fetch("https://example.com/sitemap.xml");
    const text = await res.text();
    expect.soft(text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect.soft(text).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect.soft(text).toContain("</urlset>");
  });
});
