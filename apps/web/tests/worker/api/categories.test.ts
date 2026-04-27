import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import type { FeedCategory, FeedConfig } from "../../../worker/types";

const ALL_CATEGORIES: FeedCategory[] = ["bigtech", "ai", "jp", "zenn"];

const FEEDS: FeedConfig[] = [
  {
    id: "openai-blog",
    name: "OpenAI Blog",
    url: "https://x.test/openai",
    category: "ai",
    lang: "en",
    enabled: true,
  },
  {
    id: "anthropic-blog",
    name: "Anthropic Blog",
    url: "https://x.test/anthropic",
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
    enabled: true,
  },
  // jp カテゴリのフィードは投入しない (feeds_count=0 になる)
];

// 今日を基準に日付を計算するヘルパ
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

interface CategorySummary {
  category: FeedCategory;
  feeds_count: number;
  articles_30d: number;
  last_published_at: string | null;
}

interface CategoriesResponse {
  categories: CategorySummary[];
}

describe("GET /api/categories - DB 空の場合", () => {
  it("フィードを 1 件も登録しなくても 4 カテゴリ全て返る", async () => {
    const res = await SELF.fetch("https://example.com/api/categories");
    expect(res.status).toBe(200);
    const body = await res.json<CategoriesResponse>();
    expect(Array.isArray(body.categories)).toBe(true);
    expect(body.categories).toHaveLength(4);

    const cats = body.categories.map((c) => c.category).sort();
    expect(cats).toEqual([...ALL_CATEGORIES].sort());
  });

  it("DB 空の場合は全カテゴリで feeds_count=0, articles_30d=0, last_published_at=null", async () => {
    const res = await SELF.fetch("https://example.com/api/categories");
    const body = await res.json<CategoriesResponse>();

    for (const cat of body.categories) {
      expect(cat.feeds_count).toBe(0);
      expect(cat.articles_30d).toBe(0);
      expect(cat.last_published_at).toBeNull();
    }
  });
});

describe("GET /api/categories - テストデータあり", () => {
  beforeEach(async () => {
    await syncFeeds(env.DB, FEEDS);

    await insertArticles(env.DB, [
      // ai カテゴリ: 30d 以内 2 件、31d 超 1 件
      {
        guid: "ai-1",
        feed_id: "openai-blog",
        title: "AI Article 1",
        url: "https://x.test/ai/1",
        summary: null,
        author: null,
        published_at: daysAgo(5),
        category: "ai",
        lang: "en",
      },
      {
        guid: "ai-2",
        feed_id: "anthropic-blog",
        title: "AI Article 2",
        url: "https://x.test/ai/2",
        summary: null,
        author: null,
        published_at: daysAgo(20),
        category: "ai",
        lang: "en",
      },
      {
        guid: "ai-3-old",
        feed_id: "openai-blog",
        title: "AI Article 3 (old)",
        url: "https://x.test/ai/3",
        summary: null,
        author: null,
        // 30d 窓外
        published_at: daysAgo(31),
        category: "ai",
        lang: "en",
      },
      // bigtech カテゴリ: 30d 以内 1 件
      {
        guid: "bt-1",
        feed_id: "google-research",
        title: "BigTech Article 1",
        url: "https://x.test/bt/1",
        summary: null,
        author: null,
        published_at: daysAgo(10),
        category: "bigtech",
        lang: "en",
      },
      // zenn: 記事なし (articles_30d=0, last_published_at=null)
    ]);
  });

  it("4 カテゴリ全てが返る", async () => {
    const res = await SELF.fetch("https://example.com/api/categories");
    expect(res.status).toBe(200);
    const body = await res.json<CategoriesResponse>();
    expect(body.categories).toHaveLength(4);

    const cats = body.categories.map((c) => c.category).sort();
    expect(cats).toEqual([...ALL_CATEGORIES].sort());
  });

  it("feeds_count が正しい (ai=2, bigtech=1, zenn=1, jp=0)", async () => {
    const res = await SELF.fetch("https://example.com/api/categories");
    const body = await res.json<CategoriesResponse>();

    const byCategory = Object.fromEntries(body.categories.map((c) => [c.category, c]));
    expect(byCategory["ai"]!.feeds_count).toBe(2);
    expect(byCategory["bigtech"]!.feeds_count).toBe(1);
    expect(byCategory["zenn"]!.feeds_count).toBe(1);
    // jp フィードは登録していないので 0
    expect(byCategory["jp"]!.feeds_count).toBe(0);
  });

  it("articles_30d は 30 日以内の記事のみカウント (31d 前の記事は含まれない)", async () => {
    const res = await SELF.fetch("https://example.com/api/categories");
    const body = await res.json<CategoriesResponse>();

    const byCategory = Object.fromEntries(body.categories.map((c) => [c.category, c]));
    // ai: daysAgo(5) + daysAgo(20) = 2件。daysAgo(31) は除外
    expect(byCategory["ai"]!.articles_30d).toBe(2);
    expect(byCategory["bigtech"]!.articles_30d).toBe(1);
  });

  it("articles_30d=0 のカテゴリは 0 で返る (jp と zenn)", async () => {
    const res = await SELF.fetch("https://example.com/api/categories");
    const body = await res.json<CategoriesResponse>();

    const byCategory = Object.fromEntries(body.categories.map((c) => [c.category, c]));
    expect(byCategory["jp"]!.articles_30d).toBe(0);
    expect(byCategory["zenn"]!.articles_30d).toBe(0);
  });

  it("last_published_at は各カテゴリの MAX(published_at)", async () => {
    const res = await SELF.fetch("https://example.com/api/categories");
    const body = await res.json<CategoriesResponse>();

    const byCategory = Object.fromEntries(body.categories.map((c) => [c.category, c]));

    // ai: ai-1 (5d前) が最新
    expect(byCategory["ai"]!.last_published_at).not.toBeNull();
    const aiLatest = new Date(byCategory["ai"]!.last_published_at!);
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    expect(aiLatest.getTime()).toBeGreaterThan(fiveDaysAgo.getTime() - 60_000);

    // bigtech: bt-1 (10d前)
    expect(byCategory["bigtech"]!.last_published_at).not.toBeNull();

    // 記事なし -> null
    expect(byCategory["jp"]!.last_published_at).toBeNull();
    expect(byCategory["zenn"]!.last_published_at).toBeNull();
  });

  it("Cache-Control: public, max-age=300 が設定されている", async () => {
    const res = await SELF.fetch("https://example.com/api/categories");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });

  it("Content-Type は application/json", async () => {
    const res = await SELF.fetch("https://example.com/api/categories");
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("レスポンスは { categories: [...] } の形 (object でラップ)", async () => {
    const res = await SELF.fetch("https://example.com/api/categories");
    const body = await res.json<Record<string, unknown>>();
    expect(typeof body).toBe("object");
    expect("categories" in body).toBe(true);
    expect(Array.isArray(body["categories"])).toBe(true);
  });
});
