import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

const FEEDS: FeedConfig[] = [
  {
    id: "google-research",
    name: "Google Research",
    url: "https://x.test/g",
    category: "bigtech",
    lang: "en",
    enabled: true,
  },
  {
    id: "openai-blog",
    name: "OpenAI",
    url: "https://x.test/o",
    category: "ai",
    lang: "en",
    enabled: true,
  },
  {
    id: "mercari-engineering",
    name: "Mercari",
    url: "https://x.test/m",
    category: "jp",
    lang: "ja",
    enabled: true,
  },
];

beforeEach(async () => {
  await syncFeeds(env.DB, FEEDS);
  await insertArticles(env.DB, [
    {
      guid: "g-bt",
      feed_id: "google-research",
      title: "BigTech Article",
      url: "https://x.test/g/1",
      summary: "Discusses LLM optimization",
      author: null,
      published_at: "2024-04-01T00:00:00.000Z",
      category: "bigtech",
      lang: "en",
    },
    {
      guid: "g-ai",
      feed_id: "openai-blog",
      title: "AI Article",
      url: "https://x.test/o/1",
      summary: "About transformer training",
      author: null,
      published_at: "2024-04-02T00:00:00.000Z",
      category: "ai",
      lang: "en",
    },
    {
      guid: "g-jp",
      feed_id: "mercari-engineering",
      title: "メルカリの記事",
      url: "https://x.test/m/1",
      summary: "メルカリ engineering",
      author: null,
      published_at: "2024-04-03T00:00:00.000Z",
      category: "jp",
      lang: "ja",
    },
  ]);
});

describe("/api/articles", () => {
  it("returns all articles in published_at desc order", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?limit=10");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.map((a) => a.guid)).toEqual(["g-jp", "g-ai", "g-bt"]);
  });

  it("filters by category", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?category=ai");
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.map((a) => a.guid)).toEqual(["g-ai"]);
  });

  it("filters by lang", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?lang=ja");
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.map((a) => a.guid)).toEqual(["g-jp"]);
  });

  it("rejects unknown feed_id silently (returns all)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?feed_id=does-not-exist");
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.length).toBe(3);
  });

  it("filters by valid feed_id", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?feed_id=openai-blog");
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.map((a) => a.guid)).toEqual(["g-ai"]);
  });

  it("supports full text search via FTS5", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?q=transformer");
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.map((a) => a.guid)).toEqual(["g-ai"]);
  });

  it("handles pagination via cursor", async () => {
    const page1 = await SELF.fetch("https://example.com/api/articles?limit=2");
    const body1 = (await page1.json()) as {
      articles: { guid: string }[];
      nextCursor: string | null;
    };
    expect(body1.articles.length).toBe(2);
    expect(body1.nextCursor).not.toBeNull();

    const page2 = await SELF.fetch(
      `https://example.com/api/articles?limit=2&cursor=${encodeURIComponent(body1.nextCursor!)}`,
    );
    const body2 = (await page2.json()) as { articles: { guid: string }[] };
    expect(body2.articles.map((a) => a.guid)).toEqual(["g-bt"]);
  });

  it("ignores malformed cursor", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?cursor=not-base64");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { articles: unknown[] };
    expect(body.articles.length).toBe(3);
  });
});

describe("/api/stats", () => {
  it("returns aggregated counts", async () => {
    const res = await SELF.fetch("https://example.com/api/stats");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total: number;
      by_category: Record<string, number>;
      by_lang: Record<string, number>;
      stale_feeds: unknown[];
    };
    expect(body.total).toBe(3);
    expect(body.by_category).toEqual({ bigtech: 1, ai: 1, jp: 1 });
    expect(body.by_lang).toEqual({ en: 2, ja: 1 });
    // 全フィードは未収集 (last_fetched_at NULL) なので stale 扱い
    expect(body.stale_feeds.length).toBe(3);
  });

  it("flags only feeds with errors or no recent fetch", async () => {
    // 1 件は成功 (今), 1 件は error, 1 件は古い fetched_at
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    await env.DB.prepare(
      `UPDATE feeds SET last_fetched_at = ?1, last_status = 'ok:1', last_error = NULL WHERE id = 'google-research'`,
    )
      .bind(now)
      .run();
    await env.DB.prepare(
      `UPDATE feeds SET last_fetched_at = ?1, last_status = 'error', last_error = 'HTTP 500' WHERE id = 'openai-blog'`,
    )
      .bind(now)
      .run();
    await env.DB.prepare(
      `UPDATE feeds SET last_fetched_at = ?1, last_status = 'ok:0', last_error = NULL WHERE id = 'mercari-engineering'`,
    )
      .bind(old)
      .run();

    const res = await SELF.fetch("https://example.com/api/stats");
    const body = (await res.json()) as {
      stale_feeds: { id: string; last_status: string | null }[];
    };
    const ids = body.stale_feeds.map((f) => f.id).toSorted();
    expect(ids).toEqual(["mercari-engineering", "openai-blog"]);
  });
});

describe("/api/health", () => {
  it("returns ok with article count", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; articles: number };
    expect(body.status).toBe("ok");
    expect(body.articles).toBe(3);
  });
});

describe("/api/admin/collect", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collect", { method: "POST" });
    // ADMIN_TOKEN is not set in test env -> 503
    expect([401, 503]).toContain(res.status);
  });
});

describe("security headers", () => {
  it("sets X-Frame-Options and CSP on responses", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  });
});

describe("cache headers", () => {
  it("API responses use no-store", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("static asset under /assets/ uses immutable long max-age", async () => {
    const res = await SELF.fetch("https://example.com/assets/index-BYIbkfak.js");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("HTML / SPA fallback uses no-cache", async () => {
    const res = await SELF.fetch("https://example.com/");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, must-revalidate");
  });
});
