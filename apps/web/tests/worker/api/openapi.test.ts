import { describe, expect, it } from "vite-plus/test";
import { SELF } from "cloudflare:test";

describe("/api/openapi.json", () => {
  it("returns 200 with valid JSON and openapi 3.1.0", async () => {
    const res = await SELF.fetch("https://example.com/api/openapi.json");
    expect.soft(res.status).toBe(200);
    const body = (await res.json()) as { openapi: string };
    expect.soft(body.openapi).toBe("3.1.0");
  });

  it("contains expected paths", async () => {
    const res = await SELF.fetch("https://example.com/api/openapi.json");
    const body = (await res.json()) as { paths: Record<string, unknown> };
    const paths = Object.keys(body.paths);
    expect.soft(paths).toContain("/api/articles");
    expect.soft(paths).toContain("/api/feeds");
    expect.soft(paths).toContain("/api/stats");
    expect.soft(paths).toContain("/api/health");
    expect.soft(paths).toContain("/feed.json");
    expect.soft(paths).toContain("/feed.xml");
  });
});

describe("/api/docs", () => {
  it("returns 200 with text/html", async () => {
    const res = await SELF.fetch("https://example.com/api/docs");
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("HTML contains swagger-ui div and bundle script", async () => {
    const res = await SELF.fetch("https://example.com/api/docs");
    const body = await res.text();
    expect.soft(body).toContain('id="swagger-ui"');
    expect.soft(body).toContain("swagger-ui-bundle.js");
  });

  it("spec URL points to /api/openapi.json", async () => {
    const res = await SELF.fetch("https://example.com/api/docs");
    const body = await res.text();
    expect(body).toContain("/api/openapi.json");
  });
});
