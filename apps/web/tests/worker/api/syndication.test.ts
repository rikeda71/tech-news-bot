import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

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
    name: "Mercari Engineering Blog",
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
      feed_id: "cyberagent-developers",
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

describe("/feeds/:id.xml (per-feed RSS)", () => {
  it("returns 200 with only articles from the specified feed_id", async () => {
    const res = await SELF.fetch("https://example.com/feeds/openai-blog.xml");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/rss+xml");
    const text = await res.text();
    expect(text).toContain("g-ai");
    expect(text).not.toContain("g-jp");
    // channel.title には feeds.yaml の name が入る
    expect(text).toContain("<title>OpenAI News</title>");
  });

  it("returns 404 for unknown feed_id", async () => {
    const res = await SELF.fetch("https://example.com/feeds/unknown-feed.xml");
    expect(res.status).toBe(404);
  });

  it("returns 304 on If-None-Match match (ETag round-trip)", async () => {
    const res1 = await SELF.fetch("https://example.com/feeds/openai-blog.xml");
    expect(res1.status).toBe(200);
    const etag = res1.headers.get("ETag")!;
    expect(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);

    const res2 = await SELF.fetch("https://example.com/feeds/openai-blog.xml", {
      headers: { "If-None-Match": etag },
    });
    expect(res2.status).toBe(304);
    expect(res2.headers.get("ETag")).toBe(etag);
  });

  // enabled: false のフィードでも feeds.yaml に id が定義されていれば 200 を返すことを確認する。
  // google-research は feeds.yaml で enabled: true だが、ここでは enabled: false として
  // DB に登録し、それでも過去記事が配信されることを検証する。
  it("serves past articles for a feed regardless of enabled flag in DB", async () => {
    await syncFeeds(env.DB, [
      {
        id: "google-research",
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
        feed_id: "google-research",
        title: "Google Research Article",
        url: "https://x.test/gr/1",
        summary: null,
        author: null,
        published_at: "2024-04-01T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
    ]);
    // feeds.yaml に "google-research" が存在するため 200 が返る
    const res = await SELF.fetch("https://example.com/feeds/google-research.xml");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("g-gr");
  });
});

describe("/feeds/:id.json (per-feed JSON Feed)", () => {
  it("returns 200 with JSON Feed v1.1 for the specified feed_id", async () => {
    const res = await SELF.fetch("https://example.com/feeds/cyberagent-developers.json");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/feed+json");
    const body = (await res.json()) as {
      version: string;
      title: string;
      items: { id: string }[];
    };
    expect(body.version).toBe("https://jsonfeed.org/version/1.1");
    // title には feeds.yaml の name が入る
    expect(body.title).toBe("Mercari Engineering Blog");
    expect(body.items.map((i) => i.id)).toEqual(["g-jp"]);
  });

  it("returns 404 for unknown feed_id", async () => {
    const res = await SELF.fetch("https://example.com/feeds/no-such-feed.json");
    expect(res.status).toBe(404);
  });
});
