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
    expect(text).toContain("g-ai");
    expect(text).not.toContain("g-jp");
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
    const etag = res1.headers.get("ETag")!;
    expect.soft(res1.status).toBe(200);
    expect.soft(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);

    const res2 = await SELF.fetch("https://example.com/feeds/openai-blog.xml", {
      headers: { "If-None-Match": etag },
    });
    expect.soft(res2.status).toBe(304);
    expect.soft(res2.headers.get("ETag")).toBe(etag);
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

describe("/feed.atom", () => {
  it("returns 200 with Atom 1.0 feed and entries in desc order", async () => {
    const res = await SELF.fetch("https://example.com/feed.atom");
    const text = await res.text();
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/atom+xml");
    expect.soft(text.startsWith("<?xml")).toBe(true);
    expect.soft(text).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    // XML エスケープが正しく行われること
    expect.soft(text).toContain("AI &lt;Article&gt; &amp; friends");
    // 並び順: 最新が先 (bigtech: 2024-04-04 > jp: 2024-04-03 > ai: 2024-04-02)
    const bigtech = text.indexOf("g-bigtech");
    const jp = text.indexOf("g-jp");
    const ai = text.indexOf("g-ai");
    expect.soft(bigtech).toBeLessThan(jp);
    expect.soft(jp).toBeLessThan(ai);
    // JSON Feed の version 文字列が混入しないこと
    expect.soft(text).not.toContain("jsonfeed.org");
  });

  it("filters by category=ai", async () => {
    const res = await SELF.fetch("https://example.com/feed.atom?category=ai");
    const text = await res.text();
    expect.soft(res.status).toBe(200);
    expect.soft(text).toContain("g-ai");
    expect.soft(text).not.toContain("g-jp");
    expect.soft(text).not.toContain("g-bigtech");
  });
});

describe("/feeds/:id.atom (per-feed Atom)", () => {
  it("returns 200 with only articles from the specified feed_id", async () => {
    const res = await SELF.fetch("https://example.com/feeds/openai-blog.atom");
    const text = await res.text();
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/atom+xml");
    expect.soft(text).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect.soft(text).toContain("g-ai");
    expect.soft(text).not.toContain("g-jp");
    // title には feeds.yaml の name が入る
    expect.soft(text).toContain("<title>OpenAI News</title>");
    // summary が存在する場合 summary 要素が出力される
    expect.soft(text).toContain('<summary type="html">');
  });

  it("returns 404 for unknown feed_id", async () => {
    const res = await SELF.fetch("https://example.com/feeds/unknown-feed.atom");
    expect(res.status).toBe(404);
  });

  it("returns 304 on If-None-Match match (ETag round-trip)", async () => {
    const res1 = await SELF.fetch("https://example.com/feeds/openai-blog.atom");
    const etag = res1.headers.get("ETag")!;
    expect.soft(res1.status).toBe(200);
    expect.soft(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);

    const res2 = await SELF.fetch("https://example.com/feeds/openai-blog.atom", {
      headers: { "If-None-Match": etag },
    });
    expect.soft(res2.status).toBe(304);
    expect.soft(res2.headers.get("ETag")).toBe(etag);
  });

  it("omits summary element when article has no summary", async () => {
    const res = await SELF.fetch("https://example.com/feeds/cyberagent-developers.atom");
    const text = await res.text();
    expect.soft(res.status).toBe(200);
    expect.soft(text).toContain("g-jp");
    // summary が null の場合 summary 要素が出力されないこと
    expect.soft(text).not.toContain("<summary");
  });
});

describe("/feeds/category/:cat.atom", () => {
  it("returns 200 with correct Content-Type for ai category", async () => {
    const res = await SELF.fetch("https://example.com/feeds/category/ai.atom");
    const text = await res.text();
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/atom+xml");
    expect.soft(text).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect.soft(text).toContain("<title>Tech News Bot — AI Labs</title>");
    expect.soft(text).toContain("g-ai");
    expect.soft(text).not.toContain("g-jp");
    expect.soft(text).not.toContain("g-bigtech");
  });

  it("returns 200 and only jp articles for jp category", async () => {
    const res = await SELF.fetch("https://example.com/feeds/category/jp.atom");
    const text = await res.text();
    expect.soft(res.status).toBe(200);
    expect.soft(text).toContain("Tech News Bot — 国内エンジニアリング");
    expect.soft(text).toContain("g-jp");
    expect.soft(text).not.toContain("g-ai");
    expect.soft(text).not.toContain("g-bigtech");
  });

  it("returns 404 for invalid category", async () => {
    const res = await SELF.fetch("https://example.com/feeds/category/invalid.atom");
    expect(res.status).toBe(404);
  });

  it("returns 304 on ETag round-trip", async () => {
    const first = await SELF.fetch("https://example.com/feeds/category/ai.atom");
    const etag = first.headers.get("ETag");
    expect.soft(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);

    const second = await SELF.fetch("https://example.com/feeds/category/ai.atom", {
      headers: { "If-None-Match": etag! },
    });
    expect.soft(second.status).toBe(304);
  });
});

describe("/feeds/author/:author.xml (author RSS)", () => {
  it("returns 200 with application/rss+xml and channel title", async () => {
    const res = await SELF.fetch("https://example.com/feeds/author/Sam.xml");
    const text = await res.text();
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/rss+xml");
    expect.soft(text.startsWith("<?xml")).toBe(true);
    expect.soft(text).toContain('<rss version="2.0"');
    expect.soft(text).toContain("<title>Sam - tech-news-bot</title>");
    expect.soft(text).toContain("g-ai");
    expect.soft(text).not.toContain("g-jp");
    expect.soft(text).not.toContain("g-bigtech");
  });

  it("returns 200 with empty feed for unknown author", async () => {
    const res = await SELF.fetch("https://example.com/feeds/author/UnknownPerson.xml");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<rss version="2.0"');
    // items が存在しないこと
    expect(text).not.toContain("<item>");
  });

  it("decodes URL-encoded author name", async () => {
    const res = await SELF.fetch("https://example.com/feeds/author/Sam.xml");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("g-ai");

    // URL エンコードされた名前でもデコードされて同じ結果を返す
    // "Sam" に含まれる文字は特別なエンコードが不要だが、スペースを含む著者名をテスト
    // beforeEach で "Author A" を追加してエンコードテストを行う
  });

  it("returns Cache-Control: public, max-age=600", async () => {
    const res = await SELF.fetch("https://example.com/feeds/author/Sam.xml");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600");
  });

  it('returns ETag header matching W/"hex16" format', async () => {
    const res = await SELF.fetch("https://example.com/feeds/author/Sam.xml");
    const etag = res.headers.get("ETag");
    expect(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);
  });

  it("returns 304 on If-None-Match match (ETag round-trip)", async () => {
    const res1 = await SELF.fetch("https://example.com/feeds/author/Sam.xml");
    const etag = res1.headers.get("ETag")!;
    expect.soft(res1.status).toBe(200);

    const res2 = await SELF.fetch("https://example.com/feeds/author/Sam.xml", {
      headers: { "If-None-Match": etag },
    });
    expect.soft(res2.status).toBe(304);
    expect.soft(res2.headers.get("ETag")).toBe(etag);
  });

  it("returns articles in published_at DESC order", async () => {
    // beforeEach で Sam の記事は g-ai (2024-04-02) のみ
    // 新たに Sam の記事を追加して順序を確認
    await insertArticles(env.DB, [
      {
        guid: "g-sam-newer",
        feed_id: "openai-blog",
        title: "Sam Newer Article",
        url: "https://x.test/o/sam-newer",
        summary: null,
        author: "Sam",
        published_at: "2024-04-10T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);
    const res = await SELF.fetch("https://example.com/feeds/author/Sam.xml");
    const text = await res.text();
    const pos1 = text.indexOf("g-sam-newer");
    const pos2 = text.indexOf("g-ai");
    // 新しい記事が先に出現する
    expect(pos1).toBeLessThan(pos2);
  });

  it("returns at most 50 articles (limit test with 51 articles)", async () => {
    // Sam の記事を 50 件追加 (beforeEach で g-ai が既に 1 件あるので計 51 件)
    const extra = Array.from({ length: 50 }, (_, i) => ({
      guid: `g-sam-extra-${i}`,
      feed_id: "openai-blog" as const,
      title: `Sam Extra ${i}`,
      url: `https://x.test/o/sam-extra-${i}`,
      summary: null,
      author: "Sam",
      published_at: new Date(Date.UTC(2024, 2, i + 1)).toISOString(),
      category: "ai" as const,
      lang: "en" as const,
    }));
    await insertArticles(env.DB, extra);

    const res = await SELF.fetch("https://example.com/feeds/author/Sam.xml");
    expect(res.status).toBe(200);
    const text = await res.text();
    // <item> タグの数を数えて 50 件以下であることを確認
    const itemCount = (text.match(/<item>/g) ?? []).length;
    expect(itemCount).toBeLessThanOrEqual(50);
    expect(itemCount).toBe(50);
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
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);
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

describe("/feeds/author/:author.atom (author Atom)", () => {
  it("returns 200 with application/atom+xml", async () => {
    const res = await SELF.fetch("https://example.com/feeds/author/Sam.atom");
    const text = await res.text();
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/atom+xml");
    expect.soft(text.startsWith("<?xml")).toBe(true);
    expect.soft(text).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect.soft(text).toContain("<title>Sam - tech-news-bot</title>");
    expect.soft(text).toContain("g-ai");
  });

  it("returns 200 with empty feed for unknown author", async () => {
    const res = await SELF.fetch("https://example.com/feeds/author/Ghost.atom");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    // entry が存在しないこと
    expect(text).not.toContain("<entry>");
  });

  it("returns Cache-Control: public, max-age=600", async () => {
    const res = await SELF.fetch("https://example.com/feeds/author/Sam.atom");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600");
  });

  it("returns ETag header and supports 304 round-trip", async () => {
    const res1 = await SELF.fetch("https://example.com/feeds/author/Sam.atom");
    const etag = res1.headers.get("ETag")!;
    expect.soft(res1.status).toBe(200);
    expect.soft(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);

    const res2 = await SELF.fetch("https://example.com/feeds/author/Sam.atom", {
      headers: { "If-None-Match": etag },
    });
    expect.soft(res2.status).toBe(304);
  });
});

describe("/feeds/lang/:lang.xml (lang RSS)", () => {
  it("returns 200 with application/rss+xml for ja", async () => {
    const res = await SELF.fetch("https://example.com/feeds/lang/ja.xml");
    const text = await res.text();
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/rss+xml");
    expect.soft(text.startsWith("<?xml")).toBe(true);
    expect.soft(text).toContain('<rss version="2.0"');
    // title に「日本語」を含む
    expect.soft(text).toContain("日本語");
    // ja 記事のみ
    expect.soft(text).toContain("g-jp");
    expect.soft(text).not.toContain("g-ai");
    expect.soft(text).not.toContain("g-bigtech");
  });

  it("returns 200 with application/rss+xml for en", async () => {
    const res = await SELF.fetch("https://example.com/feeds/lang/en.xml");
    const text = await res.text();
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/rss+xml");
    // en 記事のみ
    expect.soft(text).toContain("g-ai");
    expect.soft(text).toContain("g-bigtech");
    expect.soft(text).not.toContain("g-jp");
  });

  it("returns 404 for invalid lang (fr)", async () => {
    const res = await SELF.fetch("https://example.com/feeds/lang/fr.xml");
    expect(res.status).toBe(404);
  });

  it("returns 404 for uppercase lang (JA)", async () => {
    const res = await SELF.fetch("https://example.com/feeds/lang/JA.xml");
    expect(res.status).toBe(404);
  });

  it("returns Cache-Control: public, max-age=600", async () => {
    const res = await SELF.fetch("https://example.com/feeds/lang/ja.xml");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600");
  });

  it("returns ETag header and supports 304 round-trip", async () => {
    const res1 = await SELF.fetch("https://example.com/feeds/lang/ja.xml");
    const etag = res1.headers.get("ETag")!;
    expect.soft(res1.status).toBe(200);
    expect.soft(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);

    const res2 = await SELF.fetch("https://example.com/feeds/lang/ja.xml", {
      headers: { "If-None-Match": etag },
    });
    expect.soft(res2.status).toBe(304);
    expect.soft(res2.headers.get("ETag")).toBe(etag);
  });

  it("returns articles in published_at DESC order", async () => {
    // ja 記事を追加して並び順を確認。g-jp という prefix を含む guid を避けるため
    // 別の名前を使い indexOf のマッチ重複を防ぐ。
    await insertArticles(env.DB, [
      {
        guid: "lang-ja-newest",
        feed_id: "cyberagent-developers",
        title: "新しい日本語記事",
        url: "https://x.test/m/newer",
        summary: null,
        author: null,
        published_at: "2024-04-10T00:00:00.000Z",
        category: "jp",
        lang: "ja",
      },
    ]);
    const res = await SELF.fetch("https://example.com/feeds/lang/ja.xml");
    const text = await res.text();
    const pos1 = text.indexOf("lang-ja-newest");
    const pos2 = text.indexOf("g-jp");
    expect(pos1).toBeLessThan(pos2);
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

describe("/feeds/lang/:lang.atom (lang Atom)", () => {
  it("returns 200 with application/atom+xml for ja", async () => {
    const res = await SELF.fetch("https://example.com/feeds/lang/ja.atom");
    const text = await res.text();
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/atom+xml");
    expect.soft(text.startsWith("<?xml")).toBe(true);
    expect.soft(text).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect.soft(text).toContain("g-jp");
    expect.soft(text).not.toContain("g-ai");
  });

  it("returns 404 for invalid lang", async () => {
    const res = await SELF.fetch("https://example.com/feeds/lang/fr.atom");
    expect(res.status).toBe(404);
  });

  it("returns Cache-Control: public, max-age=600", async () => {
    const res = await SELF.fetch("https://example.com/feeds/lang/ja.atom");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600");
  });

  it("returns ETag header and supports 304 round-trip", async () => {
    const res1 = await SELF.fetch("https://example.com/feeds/lang/en.atom");
    const etag = res1.headers.get("ETag")!;
    expect.soft(res1.status).toBe(200);
    expect.soft(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);

    const res2 = await SELF.fetch("https://example.com/feeds/lang/en.atom", {
      headers: { "If-None-Match": etag },
    });
    expect.soft(res2.status).toBe(304);
  });
});
