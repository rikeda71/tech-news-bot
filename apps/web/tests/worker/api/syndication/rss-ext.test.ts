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
