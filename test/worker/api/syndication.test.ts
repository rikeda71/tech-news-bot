import { beforeEach, describe, expect, it } from "vitest";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../shared/types";

const FEEDS: FeedConfig[] = [
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
      feed_id: "mercari-engineering",
      title: "メルカリの記事",
      url: "https://x.test/m/1",
      summary: null,
      author: null,
      published_at: "2024-04-03T00:00:00.000Z",
      category: "jp",
      lang: "ja",
    },
  ]);
});

describe("/feed.json", () => {
  it("returns JSON Feed v1.1 with all items in desc order", async () => {
    const res = await SELF.fetch("https://example.com/feed.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/feed+json");
    const body = (await res.json()) as {
      version: string;
      feed_url: string;
      items: { id: string; title: string; url: string }[];
    };
    expect(body.version).toBe("https://jsonfeed.org/version/1.1");
    expect(body.items.map((i) => i.id)).toEqual(["g-jp", "g-ai"]);
    expect(body.items[1].title).toBe("AI <Article> & friends");
  });

  it("filters by category", async () => {
    const res = await SELF.fetch("https://example.com/feed.json?category=jp");
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.map((i) => i.id)).toEqual(["g-jp"]);
  });

  it("filters by lang", async () => {
    const res = await SELF.fetch("https://example.com/feed.json?lang=en");
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.map((i) => i.id)).toEqual(["g-ai"]);
  });
});

describe("/feed.xml", () => {
  it("returns RSS 2.0 with escaped XML", async () => {
    const res = await SELF.fetch("https://example.com/feed.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/rss+xml");
    const text = await res.text();
    expect(text.startsWith("<?xml")).toBe(true);
    expect(text).toContain('<rss version="2.0"');
    expect(text).toContain("AI &lt;Article&gt; &amp; friends");
    expect(text).toContain('<guid isPermaLink="false">g-ai</guid>');
    // 並び順: 最新が先
    const ai = text.indexOf("g-ai");
    const jp = text.indexOf("g-jp");
    expect(jp).toBeLessThan(ai);
  });

  it("filters by category", async () => {
    const res = await SELF.fetch("https://example.com/feed.xml?category=ai");
    const text = await res.text();
    expect(text).toContain("g-ai");
    expect(text).not.toContain("g-jp");
  });
});
