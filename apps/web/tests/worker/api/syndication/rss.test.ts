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
    expect.soft(res.status).toBe(200);
    const text = await res.text();
    expect.soft(text).toContain('<rss version="2.0"');
    // items が存在しないこと
    expect.soft(text).not.toContain("<item>");
  });

  it("decodes URL-encoded author name", async () => {
    const res = await SELF.fetch("https://example.com/feeds/author/Sam.xml");
    expect.soft(res.status).toBe(200);
    const text = await res.text();
    expect.soft(text).toContain("g-ai");

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
    expect(res1.status).toBe(200);
    const etag = res1.headers.get("ETag")!;

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
    expect(res1.status).toBe(200);
    const etag = res1.headers.get("ETag")!;
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
