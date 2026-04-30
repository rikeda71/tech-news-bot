import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../../worker/db/articles";
import { syncFeeds } from "../../../../worker/db/feeds";
import type { FeedConfig } from "../../../../worker/types";

// loadAllFeeds() は実際の feeds.yaml を参照するため、テスト用フィードの id は
// feeds.yaml に定義された実際の id に合わせる必要がある
const FEEDS: FeedConfig[] = [
  {
    id: "openai-blog",
    name: "OpenAI News",
    url: "https://x.test/o",
    category: "ai",
    lang: "en",
    enabled: true,
  },
  {
    id: "cyberagent-developers",
    name: "CyberAgent Developers Blog",
    url: "https://x.test/m",
    category: "jp",
    lang: "ja",
    enabled: true,
  },
  {
    id: "google-developers",
    name: "Google Research Blog",
    url: "https://x.test/g",
    category: "bigtech",
    lang: "en",
    enabled: true,
  },
];

beforeEach(async () => {
  await syncFeeds(env.DB, FEEDS);
  await insertArticles(env.DB, [
    {
      guid: "g-ai",
      feed_id: "openai-blog",
      title: "AI <Article> & friends",
      url: "https://x.test/o/1",
      summary: "summary <here>",
      author: "Sam",
      published_at: "2024-04-02T00:00:00.000Z",
      category: "ai",
      lang: "en",
    },
    {
      guid: "g-jp",
      feed_id: "cyberagent-developers",
      title: "メルカリの記事",
      url: "https://x.test/m/1",
      summary: null,
      author: null,
      published_at: "2024-04-03T00:00:00.000Z",
      category: "jp",
      lang: "ja",
    },
    {
      guid: "g-bigtech",
      feed_id: "google-developers",
      title: "Google Blog Post",
      url: "https://x.test/g/1",
      summary: null,
      author: null,
      published_at: "2024-04-04T00:00:00.000Z",
      category: "bigtech",
      lang: "en",
    },
  ]);
});

describe("/feed.xml", () => {
  it("returns RSS 2.0 with escaped XML", async () => {
    const res = await SELF.fetch("https://example.com/feed.xml");
    const text = await res.text();
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/rss+xml");
    expect.soft(text.startsWith("<?xml")).toBe(true);
    expect.soft(text).toContain('<rss version="2.0"');
    expect.soft(text).toContain("AI &lt;Article&gt; &amp; friends");
    expect.soft(text).toContain('<guid isPermaLink="false">g-ai</guid>');
    // 並び順: 最新が先
    const ai = text.indexOf("g-ai");
    const jp = text.indexOf("g-jp");
    expect.soft(jp).toBeLessThan(ai);
  });

  it("filters by category", async () => {
    const res = await SELF.fetch("https://example.com/feed.xml?category=ai");
    const text = await res.text();
    expect.soft(text).toContain("g-ai");
    expect.soft(text).not.toContain("g-jp");
  });
});

describe("/feeds/:id.xml (per-feed RSS)", () => {
  it("returns 200 with only articles from the specified feed_id", async () => {
    const res = await SELF.fetch("https://example.com/feeds/openai-blog.xml");
    const text = await res.text();
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/rss+xml");
    expect.soft(text).toContain("g-ai");
    expect.soft(text).not.toContain("g-jp");
    // channel.title には feeds.yaml の name が入る
    expect.soft(text).toContain("<title>OpenAI News</title>");
  });

  it("returns 404 for unknown feed_id", async () => {
    const res = await SELF.fetch("https://example.com/feeds/unknown-feed.xml");
    expect(res.status).toBe(404);
  });

  it("returns 304 on If-None-Match match (ETag round-trip)", async () => {
    const res1 = await SELF.fetch("https://example.com/feeds/openai-blog.xml");
    expect(res1.status).toBe(200);
    const etag = res1.headers.get("ETag")!;
    expect.soft(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);

    const res2 = await SELF.fetch("https://example.com/feeds/openai-blog.xml", {
      headers: { "If-None-Match": etag },
    });
    expect.soft(res2.status).toBe(304);
    expect.soft(res2.headers.get("ETag")).toBe(etag);
  });

  // enabled: false のフィードでも feeds.yaml に id が定義されていれば 200 を返すことを確認する。
  // google-developers は feeds.yaml で enabled: true だが、ここでは enabled: false として
  // DB に登録し、それでも過去記事が配信されることを検証する。
  it("serves past articles for a feed regardless of enabled flag in DB", async () => {
    await syncFeeds(env.DB, [
      {
        id: "google-developers",
        name: "Google Research Blog",
        url: "https://x.test/gr",
        category: "bigtech",
        lang: "en",
        // DB 上では disabled に設定
        enabled: false,
      },
    ]);
    await insertArticles(env.DB, [
      {
        guid: "g-gr",
        feed_id: "google-developers",
        title: "Google Research Article",
        url: "https://x.test/gr/1",
        summary: null,
        author: null,
        published_at: "2024-04-01T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
    ]);
    // feeds.yaml に "google-developers" が存在するため 200 が返る
    const res = await SELF.fetch("https://example.com/feeds/google-developers.xml");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("g-gr");
  });
});

describe("/feeds/category/:cat.xml", () => {
  it("returns 200 with correct Content-Type for bigtech category", async () => {
    const res = await SELF.fetch("https://example.com/feeds/category/bigtech.xml");
    const text = await res.text();
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/rss+xml");
    expect.soft(text.startsWith("<?xml")).toBe(true);
    expect.soft(text).toContain('<rss version="2.0"');
    expect.soft(text).toContain("Tech News Bot — Big Tech");
    expect.soft(text).toContain("g-bigtech");
  });

  it("returns 200 and only ai articles for ai category", async () => {
    const res = await SELF.fetch("https://example.com/feeds/category/ai.xml");
    const text = await res.text();
    expect.soft(res.status).toBe(200);
    expect.soft(text).toContain("Tech News Bot — AI Labs");
    expect.soft(text).toContain("g-ai");
    // 別カテゴリの記事が混入しないこと
    expect.soft(text).not.toContain("g-jp");
    expect.soft(text).not.toContain("g-bigtech");
  });

  it("returns 404 for invalid category", async () => {
    const res = await SELF.fetch("https://example.com/feeds/category/unknown.xml");
    expect(res.status).toBe(404);
  });

  it("returns 304 on ETag round-trip", async () => {
    const first = await SELF.fetch("https://example.com/feeds/category/jp.xml");
    const etag = first.headers.get("ETag");
    expect.soft(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);

    const second = await SELF.fetch("https://example.com/feeds/category/jp.xml", {
      headers: { "If-None-Match": etag! },
    });
    expect.soft(second.status).toBe(304);
  });
});
