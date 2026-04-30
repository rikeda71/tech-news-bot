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

// ---------------------------------------------------------------------------
// エッジケース: 空フィード / 特殊文字 / ヘッダー
// ---------------------------------------------------------------------------

describe("empty feed edge cases", () => {
  it("RSS /feed.xml with no articles returns valid RSS with no <item> elements", async () => {
    // beforeEach でシードされるが、カテゴリ zenn は記事がないはず
    const res = await SELF.fetch("https://example.com/feed.xml?category=zenn");
    expect.soft(res.status).toBe(200);
    const text = await res.text();
    // 空でも RSS 2.0 必須構造が揃っていること
    expect.soft(text).toContain('<rss version="2.0"');
    expect.soft(text).toContain("<channel>");
    expect.soft(text).toContain("<title>");
    expect.soft(text).toContain("<link>");
    expect.soft(text).toContain("<description>");
    expect.soft(text).not.toContain("<item>");
  });

  it("JSON /feed.json with no articles returns valid JSON Feed with empty items", async () => {
    const res = await SELF.fetch("https://example.com/feed.json?category=zenn");
    expect.soft(res.status).toBe(200);
    const body = (await res.json()) as { version: string; items: unknown[] };
    expect.soft(body.version).toBe("https://jsonfeed.org/version/1.1");
    expect.soft(body.items).toEqual([]);
  });

  it("Atom /feed.atom with no articles returns valid Atom feed with no <entry>", async () => {
    const res = await SELF.fetch("https://example.com/feed.atom?category=zenn");
    expect.soft(res.status).toBe(200);
    const text = await res.text();
    expect.soft(text).toContain('<feed xmlns="http://www.w3.org/2005/Atom">');
    expect.soft(text).toContain("<updated>");
    expect.soft(text).not.toContain("<entry>");
  });

  // 空フィード時の ETag が安定している (毎回同じ) ことを確認する
  it("RSS empty feed ETag is stable across two requests", async () => {
    const res1 = await SELF.fetch("https://example.com/feed.xml?category=zenn");
    const res2 = await SELF.fetch("https://example.com/feed.xml?category=zenn");
    const etag1 = res1.headers.get("ETag");
    const etag2 = res2.headers.get("ETag");
    expect.soft(etag1).not.toBeNull();
    expect.soft(etag1).toBe(etag2);
  });

  it("RSS empty feed supports 304 round-trip", async () => {
    const res1 = await SELF.fetch("https://example.com/feed.xml?category=zenn");
    const etag = res1.headers.get("ETag")!;
    const res2 = await SELF.fetch("https://example.com/feed.xml?category=zenn", {
      headers: { "If-None-Match": etag },
    });
    expect(res2.status).toBe(304);
  });
});

describe("special characters in article fields", () => {
  beforeEach(async () => {
    await insertArticles(env.DB, [
      {
        guid: "g-special",
        feed_id: "openai-blog",
        // タイトル・summary に XML/HTML の特殊文字を含む
        title: "Special <chars> & \"quotes\" and 'apostrophe'",
        url: "https://x.test/o/special",
        summary: "<script>alert('xss')</script> & <b>bold</b>",
        author: "O'Reilly & Associates",
        published_at: "2024-05-01T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);
  });

  it("RSS escapes special characters in item title, summary, author", async () => {
    const res = await SELF.fetch("https://example.com/feed.xml?category=ai");
    expect.soft(res.status).toBe(200);
    const text = await res.text();
    // エスケープ確認
    expect.soft(text).toContain("Special &lt;chars&gt; &amp; &quot;quotes&quot;");
    expect.soft(text).toContain("&lt;script&gt;alert(");
    expect.soft(text).toContain("O&apos;Reilly &amp; Associates");
  });

  it("Atom escapes special characters in entry title and summary", async () => {
    const res = await SELF.fetch("https://example.com/feed.atom?category=ai");
    expect.soft(res.status).toBe(200);
    const text = await res.text();
    expect.soft(text).toContain("Special &lt;chars&gt; &amp; &quot;quotes&quot;");
    expect.soft(text).toContain("&lt;script&gt;alert(");
  });

  it("JSON Feed preserves raw characters in title (no XML escaping needed)", async () => {
    const res = await SELF.fetch("https://example.com/feed.json?category=ai");
    expect.soft(res.status).toBe(200);
    const body = (await res.json()) as { items: { title: string; content_text: string }[] };
    const special = body.items.find((i) => i.title.includes("Special"));
    expect(special).toBeDefined();
    // JSON では XML エスケープ不要; 生の文字列が入っていること
    expect.soft(special?.title).toContain("<chars>");
    expect.soft(special?.content_text).toContain("<script>");
  });

  it("Atom entry date fields are valid ISO 8601", async () => {
    const res = await SELF.fetch("https://example.com/feed.atom?category=ai");
    const text = await res.text();
    // <updated> タグの値が ISO 8601 形式であること (簡易チェック)
    const updatedMatches = [...text.matchAll(/<updated>([^<]+)<\/updated>/g)];
    for (const m of updatedMatches) {
      expect(Number.isNaN(new Date(m[1] ?? "").getTime())).toBe(false);
    }
    const publishedMatches = [...text.matchAll(/<published>([^<]+)<\/published>/g)];
    for (const m of publishedMatches) {
      expect(Number.isNaN(new Date(m[1] ?? "").getTime())).toBe(false);
    }
  });

  it("JSON Feed date_published is valid ISO 8601", async () => {
    const res = await SELF.fetch("https://example.com/feed.json?category=ai");
    const body = (await res.json()) as { items: { date_published: string }[] };
    for (const item of body.items) {
      expect(Number.isNaN(new Date(item.date_published).getTime())).toBe(false);
    }
  });
});
