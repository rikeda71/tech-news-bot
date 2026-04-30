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
    expect(res1.status).toBe(200);
    const etag = res1.headers.get("ETag")!;
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
    expect.soft(res.status).toBe(200);
    const text = await res.text();
    expect.soft(text).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    // entry が存在しないこと
    expect.soft(text).not.toContain("<entry>");
  });

  it("returns Cache-Control: public, max-age=600", async () => {
    const res = await SELF.fetch("https://example.com/feeds/author/Sam.atom");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600");
  });

  it("returns ETag header and supports 304 round-trip", async () => {
    const res1 = await SELF.fetch("https://example.com/feeds/author/Sam.atom");
    expect(res1.status).toBe(200);
    const etag = res1.headers.get("ETag")!;
    expect.soft(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);

    const res2 = await SELF.fetch("https://example.com/feeds/author/Sam.atom", {
      headers: { "If-None-Match": etag },
    });
    expect.soft(res2.status).toBe(304);
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
    expect(res1.status).toBe(200);
    const etag = res1.headers.get("ETag")!;
    expect.soft(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);

    const res2 = await SELF.fetch("https://example.com/feeds/lang/en.atom", {
      headers: { "If-None-Match": etag },
    });
    expect.soft(res2.status).toBe(304);
  });
});
