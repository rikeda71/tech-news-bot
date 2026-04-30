import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../../worker/db/articles";
import { syncFeeds } from "../../../../worker/db/feeds";
import type { Article, FeedConfig } from "../../../../worker/types";

const FEEDS: FeedConfig[] = [
  {
    id: "openai-blog",
    name: "OpenAI News",
    url: "https://x.test/openai",
    category: "ai",
    lang: "en",
    enabled: true,
  },
  {
    id: "google-research",
    name: "Google Research",
    url: "https://x.test/google",
    category: "bigtech",
    lang: "en",
    enabled: true,
  },
  {
    id: "zenn-ai",
    name: "Zenn AI",
    url: "https://zenn.dev/topics/ai/feed",
    category: "zenn",
    lang: "ja",
    enabled: false,
  },
  {
    id: "cyberagent-blog",
    name: "CyberAgent Tech Blog",
    url: "https://x.test/ca",
    category: "jp",
    lang: "ja",
    enabled: true,
  },
];

// 今日を基準に日付を計算するヘルパ
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(async () => {
  await syncFeeds(env.DB, FEEDS);

  await insertArticles(env.DB, [
    // openai-blog: 30d 以内に 2 件、30d 超に 1 件
    {
      guid: "openai-1",
      feed_id: "openai-blog",
      title: "OpenAI Article 1",
      url: "https://x.test/openai/1",
      summary: null,
      author: null,
      published_at: daysAgo(5),
      category: "ai",
      lang: "en",
    },
    {
      guid: "openai-2",
      feed_id: "openai-blog",
      title: "OpenAI Article 2",
      url: "https://x.test/openai/2",
      summary: null,
      author: null,
      published_at: daysAgo(20),
      category: "ai",
      lang: "en",
    },
    {
      guid: "openai-3",
      feed_id: "openai-blog",
      title: "OpenAI Article 3 (old)",
      url: "https://x.test/openai/3",
      summary: null,
      author: null,
      // 30d 窓外: articles_30d に含まれないが last_published_at には影響しない
      published_at: daysAgo(31),
      category: "ai",
      lang: "en",
    },
    // google-research: 30d 以内に 1 件
    {
      guid: "google-1",
      feed_id: "google-research",
      title: "Google Research Article",
      url: "https://x.test/google/1",
      summary: null,
      author: null,
      published_at: daysAgo(10),
      category: "bigtech",
      lang: "en",
    },
    // cyberagent-blog: 記事なし (articles_30d=0, last_published_at=null を確認)
    // zenn-ai: 記事なし
  ]);
});

describe("GET /api/feeds/:id", () => {
  // 11 件挿入して default 10 件上限のテストに使う
  beforeEach(async () => {
    await insertArticles(
      env.DB,
      Array.from({ length: 9 }, (_, i) => ({
        guid: `openai-extra-${i + 1}`,
        feed_id: "openai-blog",
        title: `OpenAI Extra ${i + 1}`,
        url: `https://x.test/openai/extra-${i + 1}`,
        summary: null,
        author: null,
        // openai-1 (daysAgo(5)), openai-2 (daysAgo(20)) は beforeEach で投入済み
        // extra は daysAgo(1) 〜 daysAgo(9) を追加して合計 11 件にする
        published_at: daysAgo(i + 1),
        category: "ai" as const,
        lang: "en" as const,
      })),
    );
  });

  it("returns 404 for unknown id", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/no-such-feed");
    const body = await res.json<{ error: string }>();
    expect.soft(res.status).toBe(404);
    expect.soft(body.error).toBe("feed not found");
  });

  it("returns 200 with feed and recent_articles structure", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog");
    const body = await res.json<{ feed: unknown; recent_articles: unknown[] }>();
    expect.soft(res.status).toBe(200);
    expect.soft(body.feed).toBeDefined();
    expect.soft(Array.isArray(body.recent_articles)).toBe(true);
  });

  it("returns correct feed fields", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog");
    const body = await res.json<{
      feed: {
        id: string;
        name: string;
        url: string;
        category: string;
        lang: string;
        enabled: boolean;
        articles_30d: number;
        last_published_at: string | null;
      };
      recent_articles: unknown[];
    }>();
    expect.soft(body.feed.id).toBe("openai-blog");
    expect.soft(body.feed.name).toBe("OpenAI News");
    expect.soft(body.feed.category).toBe("ai");
    expect.soft(body.feed.lang).toBe("en");
    expect.soft(body.feed.enabled).toBe(true);
    // openai-1 (5d), openai-2 (20d), extra 1-9 (1-9d) = 11件、openai-3 (31d) は窓外
    expect.soft(body.feed.articles_30d).toBe(11);
    expect.soft(body.feed.last_published_at).not.toBeNull();
  });

  it("returns default 10 recent_articles when recent is not specified", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog");
    const body = await res.json<{ feed: unknown; recent_articles: Article[] }>();
    // 11 件あるが default は 10 件
    expect(body.recent_articles.length).toBe(10);
  });

  it("returns recent_articles sorted by published_at descending", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog");
    const body = await res.json<{ feed: unknown; recent_articles: Article[] }>();
    const dates = body.recent_articles.map((a) => a.published_at);
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i] >= dates[i + 1]).toBe(true);
    }
  });

  it("returns empty recent_articles when recent=0", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog?recent=0");
    const body = await res.json<{ feed: unknown; recent_articles: Article[] }>();
    expect.soft(res.status).toBe(200);
    expect.soft(body.recent_articles).toEqual([]);
  });

  it("returns 400 when recent=51", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog?recent=51");
    const body = await res.json<{ error: string }>();
    expect.soft(res.status).toBe(400);
    expect.soft(body.error).toContain("recent must be an integer");
  });

  it("returns specified number of recent_articles when recent=3", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog?recent=3");
    const body = await res.json<{ feed: unknown; recent_articles: Article[] }>();
    expect.soft(res.status).toBe(200);
    expect.soft(body.recent_articles.length).toBe(3);
  });

  it("returns 0 articles_30d and null last_published_at for feed with no articles", async () => {
    // google-research には 30d 以内の記事が 1 件 (beforeEach で投入済み)
    // 新しいフィードで確認するため zenn-ai を使う
    const res = await SELF.fetch("https://example.com/api/feeds/zenn-ai");
    const body = await res.json<{
      feed: { articles_30d: number; last_published_at: string | null };
      recent_articles: Article[];
    }>();
    expect.soft(res.status).toBe(200);
    expect.soft(body.feed.articles_30d).toBe(0);
    expect.soft(body.feed.last_published_at).toBeNull();
    expect.soft(body.recent_articles).toEqual([]);
  });

  it("sets Cache-Control: public, max-age=300", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });

  it("returns Content-Type application/json", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog");
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});
