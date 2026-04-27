import { describe, expect, it } from "vite-plus/test";
import { SELF } from "cloudflare:test";

describe("/api/openapi.json", () => {
  it("returns 200 with valid JSON and openapi 3.1.0", async () => {
    const res = await SELF.fetch("https://example.com/api/openapi.json");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { openapi: string };
    expect(body.openapi).toBe("3.1.0");
  });

  it("contains expected paths", async () => {
    const res = await SELF.fetch("https://example.com/api/openapi.json");
    const body = (await res.json()) as { paths: Record<string, unknown> };
    const paths = Object.keys(body.paths);
    expect(paths).toContain("/api/articles");
    expect(paths).toContain("/api/feeds");
    expect(paths).toContain("/api/stats");
    expect(paths).toContain("/api/health");
    expect(paths).toContain("/feed.json");
    expect(paths).toContain("/feed.xml");
  });
});

describe("/api/docs", () => {
  it("returns 200 with text/html", async () => {
    const res = await SELF.fetch("https://example.com/api/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });
});
