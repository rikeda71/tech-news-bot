import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../../worker/db/articles";
import { syncFeeds } from "../../../../worker/db/feeds";
import type { FeedConfig } from "../../../../worker/types";

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
    id: "zenn-mizchi",
    name: "Zenn AI",
    url: "https://zenn.dev/mizchi/feed",
    category: "personal",
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
    // zenn-mizchi: 記事なし
  ]);
});

describe("GET /api/feeds - basic", () => {
  it("returns feeds array with articles_30d and last_published_at fields", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds");
    const body = (await res.json()) as {
      feeds: {
        id: string;
        articles_30d: number;
        last_published_at: string | null;
        enabled: boolean;
      }[];
    };
    expect.soft(res.status).toBe(200);
    expect(Array.isArray(body.feeds)).toBe(true);
    const openai = body.feeds.find((f) => f.id === "openai-blog");
    expect(openai).toBeDefined();
    expect.soft(openai!.articles_30d).toBe(2);
    expect.soft(openai!.last_published_at).not.toBeNull();
    expect.soft(openai!.enabled).toBe(true);
  });

  it("articles_30d counts only articles within 30 days", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds");
    const body = (await res.json()) as { feeds: { id: string; articles_30d: number }[] };
    const openai = body.feeds.find((f) => f.id === "openai-blog");
    // 30d 以内: openai-1 (5d前), openai-2 (20d前) = 2件。openai-3 (31d前) は除外
    expect(openai!.articles_30d).toBe(2);
  });

  it("last_published_at is the overall MAX published_at (not limited to 30d)", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds");
    const body = (await res.json()) as {
      feeds: { id: string; last_published_at: string | null }[];
    };
    const openai = body.feeds.find((f) => f.id === "openai-blog");
    // MAX は 5d 前の記事 (openai-1) = articles_30d window 内の最新
    // 31d 前の記事 (openai-3) が最古なので last_published_at は openai-1 の日付
    expect(openai!.last_published_at).not.toBeNull();
    const lastPub = new Date(openai!.last_published_at!);
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    // 5d 前の記事が最新なので last_published_at は今から 5 日以内
    expect(lastPub.getTime()).toBeGreaterThan(fiveDaysAgo.getTime() - 60_000);
  });

  it("feed with 0 articles has articles_30d=0 and last_published_at=null", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds");
    const body = (await res.json()) as {
      feeds: { id: string; articles_30d: number; last_published_at: string | null }[];
    };
    const ca = body.feeds.find((f) => f.id === "cyberagent-blog");
    expect(ca).toBeDefined();
    expect.soft(ca!.articles_30d).toBe(0);
    expect.soft(ca!.last_published_at).toBeNull();
  });

  it("returns feeds sorted by id ASC", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds");
    const body = (await res.json()) as { feeds: { id: string }[] };
    const ids = body.feeds.map((f) => f.id);
    expect(ids).toEqual(ids.toSorted());
  });

  it("sets Cache-Control with max-age and stale-while-revalidate", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds");
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Cache-Control")).toContain("max-age=300");
    expect.soft(res.headers.get("Cache-Control")).toContain("stale-while-revalidate=900");
  });
});

describe("GET /api/feeds - filter by category", () => {
  it("returns only ai feeds when category=ai", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds?category=ai");
    const body = (await res.json()) as { feeds: { id: string; category: string }[] };
    expect.soft(res.status).toBe(200);
    expect.soft(body.feeds.every((f) => f.category === "ai")).toBe(true);
    expect.soft(body.feeds.some((f) => f.id === "openai-blog")).toBe(true);
    expect.soft(body.feeds.some((f) => f.id === "google-research")).toBe(false);
  });

  it("returns 400 for invalid category value", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds?category=invalid");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/feeds - filter by lang", () => {
  it("returns only ja feeds when lang=ja", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds?lang=ja");
    const body = (await res.json()) as { feeds: { id: string; lang: string }[] };
    expect.soft(res.status).toBe(200);
    expect.soft(body.feeds.every((f) => f.lang === "ja")).toBe(true);
    expect.soft(body.feeds.some((f) => f.id === "openai-blog")).toBe(false);
  });

  it("returns 400 for invalid lang value", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds?lang=zh");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/feeds - filter by enabled", () => {
  it("returns only disabled feeds when enabled=false", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds?enabled=false");
    const body = (await res.json()) as { feeds: { id: string; enabled: boolean }[] };
    expect.soft(res.status).toBe(200);
    expect.soft(body.feeds.every((f) => !f.enabled)).toBe(true);
    expect.soft(body.feeds.some((f) => f.id === "zenn-mizchi")).toBe(true);
    expect.soft(body.feeds.some((f) => f.id === "openai-blog")).toBe(false);
  });

  it("returns only enabled feeds when enabled=true", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds?enabled=true");
    const body = (await res.json()) as { feeds: { id: string; enabled: boolean }[] };
    expect.soft(res.status).toBe(200);
    expect.soft(body.feeds.every((f) => f.enabled)).toBe(true);
    expect.soft(body.feeds.some((f) => f.id === "zenn-mizchi")).toBe(false);
  });

  it("returns 400 for invalid enabled value", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds?enabled=yes");
    expect(res.status).toBe(400);
  });
});
