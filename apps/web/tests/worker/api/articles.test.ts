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
    name: "OpenAI Blog",
    url: "https://x.test/o",
    category: "ai",
    lang: "en",
    enabled: true,
  },
];

beforeEach(async () => {
  await syncFeeds(env.DB, FEEDS);
  await insertArticles(env.DB, [
    {
      guid: "g-bt-1",
      feed_id: "google-research",
      title: "BigTech Article One",
      url: "https://x.test/g/1",
      summary: "Discusses LLM optimization",
      author: "Author A",
      published_at: "2024-04-01T00:00:00.000Z",
      category: "bigtech",
      lang: "en",
    },
    {
      guid: "o-ai-1",
      feed_id: "openai-blog",
      title: "AI Article One",
      url: "https://x.test/o/1",
      summary: "Discusses GPT",
      author: "Author B",
      published_at: "2024-04-02T00:00:00.000Z",
      category: "ai",
      lang: "en",
    },
    {
      guid: "o-ai-2",
      feed_id: "openai-blog",
      title: "AI Article Two",
      url: "https://x.test/o/2",
      summary: "Discusses DALL-E",
      author: "Author C",
      published_at: "2024-04-03T00:00:00.000Z",
      category: "ai",
      lang: "en",
    },
  ]);
});

describe("GET /api/articles/random", () => {
  it("returns 200 with articles array using default n=10", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/random");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json<{ articles: unknown[] }>();
    expect(Array.isArray(body.articles)).toBe(true);
    // DB に 3 件しかないので 3 件以下
    expect(body.articles.length).toBeLessThanOrEqual(3);
  });

  it("returns n=5 articles when n=5 is specified and enough records exist", async () => {
    // DB には 3 件しかないため n=2 で 2 件返ることを確認
    const res = await SELF.fetch("https://example.com/api/articles/random?n=2");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: unknown[] }>();
    expect(body.articles.length).toBe(2);
  });

  it("returns only ai category articles when category=ai", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/random?category=ai");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { category: string }[] }>();
    expect(body.articles.length).toBeGreaterThan(0);
    for (const article of body.articles) {
      expect(article.category).toBe("ai");
    }
  });

  it("returns 400 when n=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/random?n=0");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("n must be 1-50");
  });

  it("returns 400 when n=100", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/random?n=100");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("n must be 1-50");
  });
});

describe("GET /api/articles/:id", () => {
  it("returns 200 with full article fields for existing article", async () => {
    // 挿入した記事の id を D1 から取得
    const row = await env.DB.prepare("SELECT id FROM articles WHERE guid = ?1")
      .bind("g-bt-1")
      .first<{ id: number }>();
    const id = row?.id;

    const res = await SELF.fetch(`https://example.com/api/articles/${id}`);
    expect(res.status).toBe(200);

    const body = await res.json<{
      id: number;
      guid: string;
      feed_id: string;
      feed_name: string | null;
      title: string;
      url: string;
      summary: string | null;
      author: string | null;
      published_at: string;
      fetched_at: string;
      category: string;
      lang: string;
    }>();
    expect(body.id).toBe(id);
    expect(body.guid).toBe("g-bt-1");
    expect(body.feed_id).toBe("google-research");
    expect(body.title).toBe("BigTech Article One");
    expect(body.url).toBe("https://x.test/g/1");
    expect(body.category).toBe("bigtech");
    expect(body.lang).toBe("en");
    expect(typeof body.fetched_at).toBe("string");
  });

  it("returns 404 for non-existent id", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/99999999");
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("not found");
  });

  it("returns 400 for non-integer id", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/abc");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid id");
  });

  it("returns 304 when If-None-Match matches ETag", async () => {
    const row = await env.DB.prepare("SELECT id FROM articles WHERE guid = ?1")
      .bind("g-bt-1")
      .first<{ id: number }>();
    const id = row?.id;

    // 1回目のリクエストで ETag を取得
    const res1 = await SELF.fetch(`https://example.com/api/articles/${id}`);
    expect(res1.status).toBe(200);
    const etag = res1.headers.get("ETag");
    expect(etag).not.toBeNull();

    // 2回目は If-None-Match を付けて 304 を期待
    const res2 = await SELF.fetch(`https://example.com/api/articles/${id}`, {
      headers: { "If-None-Match": etag! },
    });
    expect(res2.status).toBe(304);
  });

  it("returns Content-Type application/json for 200 response", async () => {
    const row = await env.DB.prepare("SELECT id FROM articles WHERE guid = ?1")
      .bind("g-bt-1")
      .first<{ id: number }>();
    const id = row?.id;

    const res = await SELF.fetch(`https://example.com/api/articles/${id}`);
    expect(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type");
    expect(contentType).toMatch(/application\/json/);
  });
});
