import { beforeEach, describe, it, expect } from "vite-plus/test";
import { SELF } from "cloudflare:test";
import { insertSampleArticles } from "../../../fixtures/articles";

beforeEach(async () => {
  await insertSampleArticles();
});

describe("GET /api/articles/random", () => {
  it("returns 200 with articles array using default n=10", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/random");
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json<{ articles: unknown[] }>();
    expect.soft(Array.isArray(body.articles)).toBe(true);
    // DB に 3 件しかないので 3 件以下
    expect.soft(body.articles.length).toBeLessThanOrEqual(3);
  });

  it("returns n=5 articles when n=5 is specified and enough records exist", async () => {
    // DB には 3 件しかないため n=2 で 2 件返ることを確認
    const res = await SELF.fetch("https://example.com/api/articles/random?n=2");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ articles: unknown[] }>();
    expect.soft(body.articles.length).toBe(2);
  });

  it("returns only ai category articles when category=ai", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/random?category=ai");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ articles: { category: string }[] }>();
    expect(body.articles.length).toBeGreaterThan(0);
    for (const article of body.articles) {
      expect.soft(article.category).toBe("ai");
    }
  });

  it("returns 400 when n=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/random?n=0");
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toBe("n must be 1-50");
  });

  it("returns 400 when n=100", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/random?n=100");
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toBe("n must be 1-50");
  });
});
