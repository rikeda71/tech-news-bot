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
    id: "google-research",
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
      feed_id: "google-research",
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

describe("/feed.json", () => {
  it("returns JSON Feed v1.1 with all items in desc order", async () => {
    const res = await SELF.fetch("https://example.com/feed.json");
    const body = (await res.json()) as {
      version: string;
      feed_url: string;
      items: { id: string; title: string; url: string }[];
    };
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/feed+json");
    expect.soft(body.version).toBe("https://jsonfeed.org/version/1.1");
    expect.soft(body.items.map((i) => i.id)).toEqual(["g-bigtech", "g-jp", "g-ai"]);
    expect.soft(body.items[2].title).toBe("AI <Article> & friends");
  });

  it("filters by category", async () => {
    const res = await SELF.fetch("https://example.com/feed.json?category=jp");
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.map((i) => i.id)).toEqual(["g-jp"]);
  });

  it("filters by lang", async () => {
    const res = await SELF.fetch("https://example.com/feed.json?lang=en");
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.map((i) => i.id)).toEqual(["g-bigtech", "g-ai"]);
  });
});

describe("/feeds/:id.json (per-feed JSON Feed)", () => {
  it("returns 200 with JSON Feed v1.1 for the specified feed_id", async () => {
    const res = await SELF.fetch("https://example.com/feeds/cyberagent-developers.json");
    const body = (await res.json()) as {
      version: string;
      title: string;
      items: { id: string }[];
    };
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/feed+json");
    expect.soft(body.version).toBe("https://jsonfeed.org/version/1.1");
    // title には feeds.yaml の name が入る
    expect.soft(body.title).toBe("CyberAgent Developers Blog");
    expect.soft(body.items.map((i) => i.id)).toEqual(["g-jp"]);
  });

  it("returns 404 for unknown feed_id", async () => {
    const res = await SELF.fetch("https://example.com/feeds/no-such-feed.json");
    expect(res.status).toBe(404);
  });
});

describe("/feeds/category/:cat.json", () => {
  it("returns 200 with correct Content-Type for ai category", async () => {
    const res = await SELF.fetch("https://example.com/feeds/category/ai.json");
    const body = (await res.json()) as {
      version: string;
      title: string;
      items: { id: string }[];
    };
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/feed+json");
    expect.soft(body.version).toBe("https://jsonfeed.org/version/1.1");
    expect.soft(body.title).toBe("Tech News Bot — AI Labs");
    expect.soft(body.items.map((i) => i.id)).toEqual(["g-ai"]);
  });

  it("returns 200 and only jp articles for jp category", async () => {
    const res = await SELF.fetch("https://example.com/feeds/category/jp.json");
    const body = (await res.json()) as { title: string; items: { id: string }[] };
    expect.soft(res.status).toBe(200);
    expect.soft(body.title).toBe("Tech News Bot — 国内エンジニアリング");
    expect.soft(body.items.map((i) => i.id)).toEqual(["g-jp"]);
    // 別カテゴリの記事が混入しないこと
    expect.soft(body.items.find((i) => i.id === "g-ai")).toBeUndefined();
    expect.soft(body.items.find((i) => i.id === "g-bigtech")).toBeUndefined();
  });

  it("returns 404 for invalid category", async () => {
    const res = await SELF.fetch("https://example.com/feeds/category/invalid.json");
    expect(res.status).toBe(404);
  });

  it("returns 304 on ETag round-trip", async () => {
    const first = await SELF.fetch("https://example.com/feeds/category/ai.json");
    const etag = first.headers.get("ETag");
    expect.soft(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);

    const second = await SELF.fetch("https://example.com/feeds/category/ai.json", {
      headers: { "If-None-Match": etag! },
    });
    expect.soft(second.status).toBe(304);
  });
});

describe("/feeds/author/:author.json (author JSON Feed)", () => {
  it("returns 200 with application/feed+json and items array", async () => {
    const res = await SELF.fetch("https://example.com/feeds/author/Sam.json");
    const body = (await res.json()) as {
      version: string;
      title: string;
      items: { id: string }[];
    };
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/feed+json");
    expect.soft(body.version).toBe("https://jsonfeed.org/version/1.1");
    expect.soft(body.title).toBe("Sam - tech-news-bot");
    expect.soft(body.items.map((i) => i.id)).toContain("g-ai");
  });

  it("returns 200 with empty items for unknown author", async () => {
    const res = await SELF.fetch("https://example.com/feeds/author/NoSuchPerson.json");
    expect.soft(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect.soft(body.items).toEqual([]);
  });

  it("decodes URL-encoded author name (%20 → space)", async () => {
    // "Author A" という著者を登録してエンコード URL でアクセス
    await insertArticles(env.DB, [
      {
        guid: "g-author-a",
        feed_id: "openai-blog",
        title: "Article by Author A",
        url: "https://x.test/o/author-a",
        summary: null,
        author: "Author A",
        published_at: "2024-04-05T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);
    const res = await SELF.fetch("https://example.com/feeds/author/Author%20A.json");
    const body = (await res.json()) as { title: string; items: { id: string }[] };
    expect.soft(res.status).toBe(200);
    expect.soft(body.title).toBe("Author A - tech-news-bot");
    expect.soft(body.items.map((i) => i.id)).toContain("g-author-a");
  });

  it("returns Cache-Control: public, max-age=600", async () => {
    const res = await SELF.fetch("https://example.com/feeds/author/Sam.json");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600");
  });
});

describe("/feeds/lang/:lang.json (lang JSON Feed)", () => {
  it("returns 200 with application/feed+json for ja with correct item count", async () => {
    // beforeEach: ja=1 (g-jp), en=2 (g-ai, g-bigtech)
    const res = await SELF.fetch("https://example.com/feeds/lang/ja.json");
    const body = (await res.json()) as {
      version: string;
      title: string;
      items: { id: string }[];
    };
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/feed+json");
    expect.soft(body.version).toBe("https://jsonfeed.org/version/1.1");
    expect.soft(body.items.length).toBe(1);
    expect.soft(body.items.map((i) => i.id)).toContain("g-jp");
  });

  it("returns correct item count for en (2 articles)", async () => {
    const res = await SELF.fetch("https://example.com/feeds/lang/en.json");
    const body = (await res.json()) as { items: { id: string }[] };
    expect.soft(res.status).toBe(200);
    expect.soft(body.items.length).toBe(2);
    expect.soft(body.items.map((i) => i.id)).toContain("g-ai");
    expect.soft(body.items.map((i) => i.id)).toContain("g-bigtech");
  });

  it("returns 404 for invalid lang", async () => {
    const res = await SELF.fetch("https://example.com/feeds/lang/fr.json");
    expect(res.status).toBe(404);
  });

  it("returns Cache-Control: public, max-age=600", async () => {
    const res = await SELF.fetch("https://example.com/feeds/lang/en.json");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600");
  });

  it("ETag differs between ja and en", async () => {
    const resJa = await SELF.fetch("https://example.com/feeds/lang/ja.json");
    const resEn = await SELF.fetch("https://example.com/feeds/lang/en.json");
    const etagJa = resJa.headers.get("ETag");
    const etagEn = resEn.headers.get("ETag");
    expect.soft(etagJa).not.toBeNull();
    expect.soft(etagEn).not.toBeNull();
    expect.soft(etagJa).not.toBe(etagEn);
  });
});
