import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

const FEEDS: FeedConfig[] = [
  {
    id: "google-research",
    name: "Google Research",
    url: "https://x.test/g",
    category: "bigtech",
    lang: "en",
    enabled: true,
  },
  {
    id: "openai-blog",
    name: "OpenAI Blog",
    url: "https://x.test/o",
    category: "ai",
    lang: "en",
    enabled: true,
  },
  {
    id: "cyberagent-developers",
    name: "Mercari Engineering",
    url: "https://x.test/m",
    category: "jp",
    lang: "ja",
    enabled: true,
  },
];

// "now" から n 日前の ISO 文字列を返す
function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(12, 0, 0, 0);
  return d.toISOString();
}

beforeEach(async () => {
  await syncFeeds(env.DB, FEEDS);
  await insertArticles(env.DB, [
    // 3 日前: bigtech × 2, ai × 1
    {
      guid: "bt-1",
      feed_id: "google-research",
      title: "BigTech 1",
      url: "https://x.test/g/1",
      summary: null,
      author: null,
      published_at: daysAgo(3),
      category: "bigtech",
      lang: "en",
    },
    {
      guid: "bt-2",
      feed_id: "google-research",
      title: "BigTech 2",
      url: "https://x.test/g/2",
      summary: null,
      author: null,
      published_at: daysAgo(3),
      category: "bigtech",
      lang: "en",
    },
    {
      guid: "ai-1",
      feed_id: "openai-blog",
      title: "AI Article",
      url: "https://x.test/o/1",
      summary: null,
      author: null,
      published_at: daysAgo(3),
      category: "ai",
      lang: "en",
    },
    // 1 日前: jp × 1
    {
      guid: "jp-1",
      feed_id: "cyberagent-developers",
      title: "Mercari Article",
      url: "https://x.test/m/1",
      summary: null,
      author: null,
      published_at: daysAgo(1),
      category: "jp",
      lang: "ja",
    },
  ]);
});

describe("GET /api/stats — category_trend_30d", () => {
  it("returns exactly 30 entries", async () => {
    const res = await SELF.fetch("https://example.com/api/stats");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      category_trend_30d: { date: string; ai: number; bigtech: number; jp: number; zenn: number }[];
    };
    expect(body.category_trend_30d).toHaveLength(30);
  });

  it("each entry has date, ai, bigtech, jp, zenn fields", async () => {
    const res = await SELF.fetch("https://example.com/api/stats");
    const body = (await res.json()) as {
      category_trend_30d: { date: string; ai: number; bigtech: number; jp: number; zenn: number }[];
    };
    const point = body.category_trend_30d[0];
    expect(typeof point.date).toBe("string");
    expect(typeof point.ai).toBe("number");
    expect(typeof point.bigtech).toBe("number");
    expect(typeof point.jp).toBe("number");
    expect(typeof point.zenn).toBe("number");
  });

  it("counts match inserted articles for days with data", async () => {
    const res = await SELF.fetch("https://example.com/api/stats");
    const body = (await res.json()) as {
      category_trend_30d: { date: string; ai: number; bigtech: number; jp: number; zenn: number }[];
    };
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const d3 = new Date(today);
    d3.setUTCDate(today.getUTCDate() - 3);
    const d3str = d3.toISOString().slice(0, 10);
    const point3 = body.category_trend_30d.find((p) => p.date === d3str);
    expect(point3).toBeDefined();
    expect(point3!.bigtech).toBe(2);
    expect(point3!.ai).toBe(1);
    expect(point3!.jp).toBe(0);

    const d1 = new Date(today);
    d1.setUTCDate(today.getUTCDate() - 1);
    const d1str = d1.toISOString().slice(0, 10);
    const point1 = body.category_trend_30d.find((p) => p.date === d1str);
    expect(point1).toBeDefined();
    expect(point1!.jp).toBe(1);
    expect(point1!.bigtech).toBe(0);
  });

  it("days with no articles have all counts as 0", async () => {
    const res = await SELF.fetch("https://example.com/api/stats");
    const body = (await res.json()) as {
      category_trend_30d: { date: string; ai: number; bigtech: number; jp: number; zenn: number }[];
    };
    // 今日 (0 日前) は記事なし
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const todayPoint = body.category_trend_30d.find((p) => p.date === todayStr);
    expect(todayPoint).toBeDefined();
    expect(todayPoint!.ai).toBe(0);
    expect(todayPoint!.bigtech).toBe(0);
    expect(todayPoint!.jp).toBe(0);
    expect(todayPoint!.zenn).toBe(0);
  });
});

describe("GET /api/stats — feed_activity", () => {
  it("returns feed_activity array", async () => {
    const res = await SELF.fetch("https://example.com/api/stats");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      feed_activity: {
        feed_id: string;
        feed_name: string;
        articles_30d: number;
        last_published_at: string | null;
      }[];
    };
    expect(Array.isArray(body.feed_activity)).toBe(true);
  });

  it("counts articles per feed correctly", async () => {
    const res = await SELF.fetch("https://example.com/api/stats");
    const body = (await res.json()) as {
      feed_activity: { feed_id: string; articles_30d: number }[];
    };
    const google = body.feed_activity.find((f) => f.feed_id === "google-research");
    const openai = body.feed_activity.find((f) => f.feed_id === "openai-blog");
    const cyberagent = body.feed_activity.find((f) => f.feed_id === "cyberagent-developers");
    expect(google?.articles_30d).toBe(2);
    expect(openai?.articles_30d).toBe(1);
    expect(cyberagent?.articles_30d).toBe(1);
  });

  it("is sorted by articles_30d descending", async () => {
    const res = await SELF.fetch("https://example.com/api/stats");
    const body = (await res.json()) as {
      feed_activity: { articles_30d: number }[];
    };
    const counts = body.feed_activity.map((f) => f.articles_30d);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });

  it("includes feed_name resolved from feeds table", async () => {
    const res = await SELF.fetch("https://example.com/api/stats");
    const body = (await res.json()) as {
      feed_activity: { feed_id: string; feed_name: string }[];
    };
    const google = body.feed_activity.find((f) => f.feed_id === "google-research");
    expect(google?.feed_name).toBe("Google Research");
  });

  it("includes last_published_at for each feed", async () => {
    const res = await SELF.fetch("https://example.com/api/stats");
    const body = (await res.json()) as {
      feed_activity: { feed_id: string; last_published_at: string | null }[];
    };
    const google = body.feed_activity.find((f) => f.feed_id === "google-research");
    expect(google?.last_published_at).not.toBeNull();
  });

  it("30d 窓外の記事は feed_activity に含まれない", async () => {
    // 31 日前の記事を追加 → 30d 窓外
    await insertArticles(env.DB, [
      {
        guid: "old-1",
        feed_id: "google-research",
        title: "Old Article",
        url: "https://x.test/g/old",
        summary: null,
        author: null,
        published_at: daysAgo(31),
        category: "bigtech",
        lang: "en",
      },
    ]);
    // beforeEach で挿入した 2 件 (30d 内) は変わらない
    const res = await SELF.fetch("https://example.com/api/stats");
    const body = (await res.json()) as {
      feed_activity: { feed_id: string; articles_30d: number }[];
    };
    const google = body.feed_activity.find((f) => f.feed_id === "google-research");
    expect(google?.articles_30d).toBe(2);
  });
});
