import { describe, expect, it } from "vite-plus/test";
import { SELF } from "cloudflare:test";

describe("/sitemap.xml", () => {
  it("returns 200 with Content-Type application/xml", async () => {
    const res = await SELF.fetch("https://example.com/sitemap.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("contains root URL <loc>", async () => {
    const res = await SELF.fetch("https://example.com/sitemap.xml");
    const text = await res.text();
    expect(text).toContain("<loc>https://example.com/</loc>");
    expect(text).toContain("<priority>1.0</priority>");
    expect(text).toContain("<changefreq>hourly</changefreq>");
  });

  it("contains enabled feed_id URL (google-research)", async () => {
    const res = await SELF.fetch("https://example.com/sitemap.xml");
    const text = await res.text();
    // feeds.yaml で enabled: true のフィードが含まれること
    expect(text).toContain("/?feed_id=google-research");
    expect(text).toContain("<changefreq>daily</changefreq>");
    expect(text).toContain("<priority>0.6</priority>");
  });
});
