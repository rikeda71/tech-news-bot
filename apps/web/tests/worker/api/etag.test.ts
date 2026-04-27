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
];

beforeEach(async () => {
  await syncFeeds(env.DB, FEEDS);
  await insertArticles(env.DB, [
    {
      guid: "g-bt",
      feed_id: "google-research",
      title: "BigTech Article",
      url: "https://x.test/g/1",
      summary: null,
      author: null,
      published_at: "2024-04-01T00:00:00.000Z",
      category: "bigtech",
      lang: "en",
    },
  ]);
});

describe("ETag - /api/articles", () => {
  it("returns ETag and Cache-Control headers on normal response", async () => {
    const res = await SELF.fetch("https://example.com/api/articles");
    expect(res.status).toBe(200);
    const etag = res.headers.get("ETag");
    expect(etag).not.toBeNull();
    expect(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("returns 304 when If-None-Match matches ETag", async () => {
    const res1 = await SELF.fetch("https://example.com/api/articles");
    const etag = res1.headers.get("ETag")!;

    const res2 = await SELF.fetch("https://example.com/api/articles", {
      headers: { "If-None-Match": etag },
    });
    expect(res2.status).toBe(304);
    expect(res2.headers.get("ETag")).toBe(etag);
    expect(res2.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("returns different ETag for different query params", async () => {
    const res1 = await SELF.fetch("https://example.com/api/articles");
    const res2 = await SELF.fetch("https://example.com/api/articles?category=ai");
    expect(res1.headers.get("ETag")).not.toBe(res2.headers.get("ETag"));
  });

  it("returns new ETag after inserting an article", async () => {
    const res1 = await SELF.fetch("https://example.com/api/articles");
    const etag1 = res1.headers.get("ETag")!;

    await insertArticles(env.DB, [
      {
        guid: "g-ai-new",
        feed_id: "openai-blog",
        title: "New AI Article",
        url: "https://x.test/o/2",
        summary: null,
        author: null,
        published_at: "2024-04-05T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);

    const res2 = await SELF.fetch("https://example.com/api/articles");
    const etag2 = res2.headers.get("ETag")!;
    expect(etag2).not.toBe(etag1);
  });

  it("does not return 304 when ETag does not match", async () => {
    const res = await SELF.fetch("https://example.com/api/articles", {
      headers: { "If-None-Match": 'W/"0000000000000000"' },
    });
    expect(res.status).toBe(200);
  });
});

describe("ETag - /feed.json", () => {
  it("returns ETag and Cache-Control headers", async () => {
    const res = await SELF.fetch("https://example.com/feed.json");
    expect(res.status).toBe(200);
    const etag = res.headers.get("ETag");
    expect(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("returns 304 when If-None-Match matches ETag", async () => {
    const res1 = await SELF.fetch("https://example.com/feed.json");
    const etag = res1.headers.get("ETag")!;

    const res2 = await SELF.fetch("https://example.com/feed.json", {
      headers: { "If-None-Match": etag },
    });
    expect(res2.status).toBe(304);
    expect(res2.headers.get("ETag")).toBe(etag);
  });
});

describe("ETag - /feed.xml", () => {
  it("returns ETag and Cache-Control headers", async () => {
    const res = await SELF.fetch("https://example.com/feed.xml");
    expect(res.status).toBe(200);
    const etag = res.headers.get("ETag");
    expect(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
  });

  it("returns 304 when If-None-Match matches ETag", async () => {
    const res1 = await SELF.fetch("https://example.com/feed.xml");
    const etag = res1.headers.get("ETag")!;

    const res2 = await SELF.fetch("https://example.com/feed.xml", {
      headers: { "If-None-Match": etag },
    });
    expect(res2.status).toBe(304);
    expect(res2.headers.get("ETag")).toBe(etag);
  });
});
