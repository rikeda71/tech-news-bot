import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import type { Article, FeedConfig } from "../../../worker/types";

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
];

beforeEach(async () => {
  await syncFeeds(env.DB, FEEDS);
  await insertArticles(env.DB, [
    {
      guid: "g-bt-1",
      feed_id: "google-research",
      title: "BigTech Article One",
      url: "https://x.test/g/1",
      summary: "Discusses LLM optimization",
      author: "Author A",
      published_at: "2024-04-01T00:00:00.000Z",
      category: "bigtech",
      lang: "en",
    },
    {
      guid: "o-ai-1",
      feed_id: "openai-blog",
      title: "AI Article One",
      url: "https://x.test/o/1",
      summary: "Discusses GPT",
      author: "Author B",
      published_at: "2024-04-02T00:00:00.000Z",
      category: "ai",
      lang: "en",
    },
    {
      guid: "o-ai-2",
      feed_id: "openai-blog",
      title: "AI Article Two",
      url: "https://x.test/o/2",
      summary: "Discusses DALL-E",
      author: "Author C",
      published_at: "2024-04-03T00:00:00.000Z",
      category: "ai",
      lang: "en",
    },
  ]);
});

describe("GET /api/articles/random", () => {
  it("returns 200 with articles array using default n=10", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/random");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json<{ articles: unknown[] }>();
    expect(Array.isArray(body.articles)).toBe(true);
    // DB に 3 件しかないので 3 件以下
    expect(body.articles.length).toBeLessThanOrEqual(3);
  });

  it("returns n=5 articles when n=5 is specified and enough records exist", async () => {
    // DB には 3 件しかないため n=2 で 2 件返ることを確認
    const res = await SELF.fetch("https://example.com/api/articles/random?n=2");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: unknown[] }>();
    expect(body.articles.length).toBe(2);
  });

  it("returns only ai category articles when category=ai", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/random?category=ai");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { category: string }[] }>();
    expect(body.articles.length).toBeGreaterThan(0);
    for (const article of body.articles) {
      expect(article.category).toBe("ai");
    }
  });

  it("returns 400 when n=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/random?n=0");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("n must be 1-50");
  });

  it("returns 400 when n=100", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/random?n=100");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("n must be 1-50");
  });
});

describe("GET /api/articles/archive", () => {
  it("returns 400 when year is missing", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/archive?month=4");
    expect(res.status).toBe(400);
  });

  it("returns 400 when month is missing", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/archive?year=2024");
    expect(res.status).toBe(400);
  });

  it("returns 400 when year=1999 (out of range)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/archive?year=1999&month=4");
    expect(res.status).toBe(400);
  });

  it("returns 400 when year=2101 (out of range)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/archive?year=2101&month=4");
    expect(res.status).toBe(400);
  });

  it("returns 400 when month=0 (out of range)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/archive?year=2024&month=0");
    expect(res.status).toBe(400);
  });

  it("returns 400 when month=13 (out of range)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/archive?year=2024&month=13");
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid category", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/archive?year=2024&month=4&category=invalid",
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid lang", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/archive?year=2024&month=4&lang=fr",
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for limit=0", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/archive?year=2024&month=4&limit=0",
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for limit=501", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/archive?year=2024&month=4&limit=501",
    );
    expect(res.status).toBe(400);
  });

  it("returns only articles from the specified month, excluding prev/next months", async () => {
    // beforeEach で 2024-04 の記事が 3 件入っている
    // 前月・翌月の記事を追加
    await insertArticles(env.DB, [
      {
        guid: "prev-month",
        feed_id: "google-research",
        title: "March Article",
        url: "https://x.test/g/march",
        summary: null,
        author: null,
        published_at: "2024-03-31T23:59:59.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "next-month",
        feed_id: "google-research",
        title: "May Article",
        url: "https://x.test/g/may",
        summary: null,
        author: null,
        published_at: "2024-05-01T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/archive?year=2024&month=4");
    expect(res.status).toBe(200);
    const body = await res.json<{
      year: number;
      month: number;
      items: { published_at: string }[];
      total: number;
    }>();
    expect(body.year).toBe(2024);
    expect(body.month).toBe(4);
    expect(body.total).toBe(3);
    expect(body.items.length).toBe(3);
    for (const item of body.items) {
      expect(item.published_at >= "2024-04-01T00:00:00.000Z").toBe(true);
      expect(item.published_at < "2024-05-01T00:00:00.000Z").toBe(true);
    }
  });

  it("returns items in published_at descending order", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/archive?year=2024&month=4");
    expect(res.status).toBe(200);
    const body = await res.json<{ items: { published_at: string }[] }>();
    const dates = body.items.map((a) => a.published_at);
    const sorted = dates.toSorted((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
  });

  it("returns limited items but total reflects full count (total > limit)", async () => {
    // 追加で 12 件挿入 (beforeEach の 3 件と合わせて 15 件)
    const extra = Array.from({ length: 12 }, (_, i) => ({
      guid: `extra-${i}`,
      feed_id: "openai-blog",
      title: `Extra ${i}`,
      url: `https://x.test/o/extra-${i}`,
      summary: null,
      author: null,
      published_at: `2024-04-10T${String(i).padStart(2, "0")}:00:00.000Z`,
      category: "ai" as const,
      lang: "en" as const,
    }));
    await insertArticles(env.DB, extra);

    const res = await SELF.fetch(
      "https://example.com/api/articles/archive?year=2024&month=4&limit=10",
    );
    expect(res.status).toBe(200);
    const body = await res.json<{ items: unknown[]; total: number }>();
    expect(body.items.length).toBe(10);
    expect(body.total).toBe(15);
  });

  it("correctly handles December to January year wrap (2025-12)", async () => {
    await insertArticles(env.DB, [
      {
        guid: "dec-article",
        feed_id: "google-research",
        title: "December Article",
        url: "https://x.test/g/dec",
        summary: null,
        author: null,
        published_at: "2025-12-15T12:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "jan-next-article",
        feed_id: "google-research",
        title: "January Next Article",
        url: "https://x.test/g/jan-next",
        summary: null,
        author: null,
        published_at: "2026-01-01T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/archive?year=2025&month=12");
    expect(res.status).toBe(200);
    const body = await res.json<{ items: { published_at: string }[]; total: number }>();
    expect(body.total).toBe(1);
    expect(body.items.length).toBe(1);
    expect(body.items[0].published_at).toBe("2025-12-15T12:00:00.000Z");
  });

  it("returns Cache-Control: public, max-age=600", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/archive?year=2024&month=4");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600");
  });

  it("returns Content-Type application/json", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/archive?year=2024&month=4");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
  });

  it("filters by year + month + category simultaneously", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/archive?year=2024&month=4&category=ai",
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      items: { category: string; published_at: string }[];
      total: number;
    }>();
    // 2024-04 に ai が 2 件 (o-ai-1, o-ai-2)
    expect(body.total).toBe(2);
    for (const item of body.items) {
      expect(item.category).toBe("ai");
    }
  });
});

describe("GET /api/articles/:id", () => {
  it("returns 200 with full article fields for existing article", async () => {
    // 挿入した記事の id を D1 から取得
    const row = await env.DB.prepare("SELECT id FROM articles WHERE guid = ?1")
      .bind("g-bt-1")
      .first<{ id: number }>();
    const id = row?.id;

    const res = await SELF.fetch(`https://example.com/api/articles/${id}`);
    expect(res.status).toBe(200);

    const body = await res.json<{
      id: number;
      guid: string;
      feed_id: string;
      feed_name: string | null;
      title: string;
      url: string;
      summary: string | null;
      author: string | null;
      published_at: string;
      fetched_at: string;
      category: string;
      lang: string;
    }>();
    expect(body.id).toBe(id);
    expect(body.guid).toBe("g-bt-1");
    expect(body.feed_id).toBe("google-research");
    expect(body.title).toBe("BigTech Article One");
    expect(body.url).toBe("https://x.test/g/1");
    expect(body.category).toBe("bigtech");
    expect(body.lang).toBe("en");
    expect(typeof body.fetched_at).toBe("string");
  });

  it("returns 404 for non-existent id", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/99999999");
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("not found");
  });

  it("returns 400 for non-integer id", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/abc");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid id");
  });

  it("returns 304 when If-None-Match matches ETag", async () => {
    const row = await env.DB.prepare("SELECT id FROM articles WHERE guid = ?1")
      .bind("g-bt-1")
      .first<{ id: number }>();
    const id = row?.id;

    // 1回目のリクエストで ETag を取得
    const res1 = await SELF.fetch(`https://example.com/api/articles/${id}`);
    expect(res1.status).toBe(200);
    const etag = res1.headers.get("ETag");
    expect(etag).not.toBeNull();

    // 2回目は If-None-Match を付けて 304 を期待
    const res2 = await SELF.fetch(`https://example.com/api/articles/${id}`, {
      headers: { "If-None-Match": etag! },
    });
    expect(res2.status).toBe(304);
  });

  it("returns Content-Type application/json for 200 response", async () => {
    const row = await env.DB.prepare("SELECT id FROM articles WHERE guid = ?1")
      .bind("g-bt-1")
      .first<{ id: number }>();
    const id = row?.id;

    const res = await SELF.fetch(`https://example.com/api/articles/${id}`);
    expect(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type");
    expect(contentType).toMatch(/application\/json/);
  });
});

describe("GET /api/articles/:guid/related", () => {
  it("returns 404 for unknown guid", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/unknown-guid-does-not-exist/related",
    );
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("not found");
  });

  it("returns 400 when n=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/related?n=0");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("n must be 1-20");
  });

  it("returns 400 when n=21", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/related?n=21");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("n must be 1-20");
  });

  it("returns same feed articles when enough exist", async () => {
    // openai-blog に記事を追加して同 feed の記事を 5 件以上にする
    const extraFeeds: FeedConfig[] = [
      {
        id: "openai-blog",
        name: "OpenAI Blog",
        url: "https://x.test/o",
        category: "ai",
        lang: "en",
        enabled: true,
      },
    ];
    await syncFeeds(env.DB, extraFeeds);
    await insertArticles(env.DB, [
      {
        guid: "o-ai-3",
        feed_id: "openai-blog",
        title: "AI Article Three",
        url: "https://x.test/o/3",
        summary: null,
        author: null,
        published_at: "2024-04-04T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
      {
        guid: "o-ai-4",
        feed_id: "openai-blog",
        title: "AI Article Four",
        url: "https://x.test/o/4",
        summary: null,
        author: null,
        published_at: "2024-04-05T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
      {
        guid: "o-ai-5",
        feed_id: "openai-blog",
        title: "AI Article Five",
        url: "https://x.test/o/5",
        summary: null,
        author: null,
        published_at: "2024-04-06T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
      {
        guid: "o-ai-6",
        feed_id: "openai-blog",
        title: "AI Article Six",
        url: "https://x.test/o/6",
        summary: null,
        author: null,
        published_at: "2024-04-07T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/related?n=5");
    expect(res.status).toBe(200);
    const body = await res.json<{ items: Article[] }>();
    expect(body.items.length).toBe(5);
    for (const item of body.items) {
      expect(item.feed_id).toBe("openai-blog");
    }
  });

  it("fills remaining slots with same category articles from other feeds", async () => {
    // google-research に bigtech 記事を追加し、bigtech の別 feed を用意
    const moreFeeds: FeedConfig[] = [
      {
        id: "meta-engineering",
        name: "Meta Engineering",
        url: "https://x.test/m",
        category: "bigtech",
        lang: "en",
        enabled: true,
      },
    ];
    await syncFeeds(env.DB, moreFeeds);
    // google-research には既に g-bt-1 が入っている (beforeEach)
    await insertArticles(env.DB, [
      {
        guid: "g-bt-2",
        feed_id: "google-research",
        title: "BigTech Article Two",
        url: "https://x.test/g/2",
        summary: null,
        author: null,
        published_at: "2024-04-02T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "m-bt-1",
        feed_id: "meta-engineering",
        title: "Meta Article One",
        url: "https://x.test/m/1",
        summary: null,
        author: null,
        published_at: "2024-04-01T12:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "m-bt-2",
        feed_id: "meta-engineering",
        title: "Meta Article Two",
        url: "https://x.test/m/2",
        summary: null,
        author: null,
        published_at: "2024-04-02T12:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "m-bt-3",
        feed_id: "meta-engineering",
        title: "Meta Article Three",
        url: "https://x.test/m/3",
        summary: null,
        author: null,
        published_at: "2024-04-03T12:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "m-bt-4",
        feed_id: "meta-engineering",
        title: "Meta Article Four",
        url: "https://x.test/m/4",
        summary: null,
        author: null,
        published_at: "2024-04-04T12:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "m-bt-5",
        feed_id: "meta-engineering",
        title: "Meta Article Five",
        url: "https://x.test/m/5",
        summary: null,
        author: null,
        published_at: "2024-04-05T12:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
    ]);

    // g-bt-1 の関連記事を n=5 で取得
    // 同 feed (google-research) には g-bt-2 の 1 件、残り 4 件は meta-engineering から
    const res = await SELF.fetch("https://example.com/api/articles/g-bt-1/related?n=5");
    expect(res.status).toBe(200);
    const body = await res.json<{ items: Article[] }>();
    expect(body.items.length).toBe(5);

    // 先頭が同 feed
    expect(body.items[0].feed_id).toBe("google-research");
    // 残りは meta-engineering (同 category)
    for (const item of body.items.slice(1)) {
      expect(item.feed_id).toBe("meta-engineering");
      expect(item.category).toBe("bigtech");
    }
  });

  it("does not include the target article itself in items", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/related");
    expect(res.status).toBe(200);
    const body = await res.json<{ items: Article[] }>();
    for (const item of body.items) {
      expect(item.guid).not.toBe("o-ai-1");
    }
  });

  it("returns items sorted by published_at desc within each segment", async () => {
    // openai-blog に記事を追加して published_at の順序を確認
    await insertArticles(env.DB, [
      {
        guid: "o-ai-3",
        feed_id: "openai-blog",
        title: "AI Article Three",
        url: "https://x.test/o/3",
        summary: null,
        author: null,
        published_at: "2024-04-04T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);

    // o-ai-1 の関連: o-ai-3 (2024-04-04) → o-ai-2 (2024-04-03) の順
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/related?n=5");
    expect(res.status).toBe(200);
    const body = await res.json<{ items: Article[] }>();
    const sameFeed = body.items.filter((i) => i.feed_id === "openai-blog");
    expect(sameFeed.length).toBeGreaterThanOrEqual(2);
    expect(sameFeed[0].published_at >= sameFeed[1].published_at).toBe(true);
  });

  it("returns Content-Type application/json", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/related");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
  });

  it("returns Cache-Control with max-age=300", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/related");
    expect(res.status).toBe(200);
    const cc = res.headers.get("Cache-Control");
    expect(cc).toContain("max-age=300");
  });
});

describe("GET /api/articles/calendar", () => {
  it("returns 200 with empty items when no articles in range", async () => {
    // beforeEach の記事は 2024-04 のため、days=30 (今から 30 日以内) では 0 件
    const res = await SELF.fetch("https://example.com/api/articles/calendar?days=30");
    expect(res.status).toBe(200);
    const body = await res.json<{ days: number; items: unknown[] }>();
    expect(body.days).toBe(30);
    expect(Array.isArray(body.items)).toBe(true);
    // 2024-04 の記事は今から 30 日以内に含まれないので空
    expect(body.items.length).toBe(0);
  });

  it("returns correct daily counts after inserting recent articles", async () => {
    // 今日の日付 (UTC) で記事を挿入
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const yesterday = new Date(today);
    yesterday.setUTCDate(today.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    await insertArticles(env.DB, [
      {
        guid: "cal-today-1",
        feed_id: "google-research",
        title: "Calendar Today 1",
        url: "https://x.test/g/cal-today-1",
        summary: null,
        author: null,
        published_at: `${todayStr}T10:00:00.000Z`,
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "cal-today-2",
        feed_id: "google-research",
        title: "Calendar Today 2",
        url: "https://x.test/g/cal-today-2",
        summary: null,
        author: null,
        published_at: `${todayStr}T11:00:00.000Z`,
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "cal-yesterday-1",
        feed_id: "openai-blog",
        title: "Calendar Yesterday 1",
        url: "https://x.test/o/cal-yesterday-1",
        summary: null,
        author: null,
        published_at: `${yesterdayStr}T09:00:00.000Z`,
        category: "ai",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/calendar?days=7");
    expect(res.status).toBe(200);
    const body = await res.json<{ days: number; items: { date: string; count: number }[] }>();
    expect(body.days).toBe(7);

    const todayItem = body.items.find((i) => i.date === todayStr);
    const yesterdayItem = body.items.find((i) => i.date === yesterdayStr);
    expect(todayItem?.count).toBe(2);
    expect(yesterdayItem?.count).toBe(1);
  });

  it("items are sorted by date ASC", async () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const yesterday = new Date(today);
    yesterday.setUTCDate(today.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    await insertArticles(env.DB, [
      {
        guid: "sort-today",
        feed_id: "google-research",
        title: "Sort Today",
        url: "https://x.test/g/sort-today",
        summary: null,
        author: null,
        published_at: `${todayStr}T10:00:00.000Z`,
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "sort-yesterday",
        feed_id: "openai-blog",
        title: "Sort Yesterday",
        url: "https://x.test/o/sort-yesterday",
        summary: null,
        author: null,
        published_at: `${yesterdayStr}T10:00:00.000Z`,
        category: "ai",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/calendar?days=7");
    expect(res.status).toBe(200);
    const body = await res.json<{ items: { date: string; count: number }[] }>();
    const dates = body.items.map((i) => i.date);
    const sorted = dates.toSorted((a, b) => a.localeCompare(b));
    expect(dates).toEqual(sorted);
  });

  it("filters by lang=ja", async () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    await insertArticles(env.DB, [
      {
        guid: "cal-ja-1",
        feed_id: "google-research",
        title: "Japanese Article",
        url: "https://x.test/g/cal-ja-1",
        summary: null,
        author: null,
        published_at: `${todayStr}T10:00:00.000Z`,
        category: "bigtech",
        lang: "ja",
      },
      {
        guid: "cal-en-1",
        feed_id: "openai-blog",
        title: "English Article",
        url: "https://x.test/o/cal-en-1",
        summary: null,
        author: null,
        published_at: `${todayStr}T11:00:00.000Z`,
        category: "ai",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/calendar?days=7&lang=ja");
    expect(res.status).toBe(200);
    const body = await res.json<{ items: { date: string; count: number }[] }>();
    const todayItem = body.items.find((i) => i.date === todayStr);
    // ja のみ: 1 件
    expect(todayItem?.count).toBe(1);
    // en の記事は含まれないので total count は 1
    const totalCount = body.items.reduce((s, i) => s + i.count, 0);
    expect(totalCount).toBe(1);
  });

  it("filters by category=ai", async () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);

    await insertArticles(env.DB, [
      {
        guid: "cal-ai-1",
        feed_id: "openai-blog",
        title: "AI Article Cal",
        url: "https://x.test/o/cal-ai-1",
        summary: null,
        author: null,
        published_at: `${todayStr}T10:00:00.000Z`,
        category: "ai",
        lang: "en",
      },
      {
        guid: "cal-bt-1",
        feed_id: "google-research",
        title: "BigTech Article Cal",
        url: "https://x.test/g/cal-bt-1",
        summary: null,
        author: null,
        published_at: `${todayStr}T11:00:00.000Z`,
        category: "bigtech",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/calendar?days=7&category=ai");
    expect(res.status).toBe(200);
    const body = await res.json<{ items: { date: string; count: number }[] }>();
    const todayItem = body.items.find((i) => i.date === todayStr);
    // ai のみ: 1 件
    expect(todayItem?.count).toBe(1);
    const totalCount = body.items.reduce((s, i) => s + i.count, 0);
    expect(totalCount).toBe(1);
  });

  it("returns 400 for days=10 (not in allowed values)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/calendar?days=10");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("days");
  });

  it("returns 400 for lang=fr (invalid)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/calendar?lang=fr");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("lang");
  });

  it("returns 400 for category=invalid", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/calendar?category=invalid");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("category");
  });

  it("returns Cache-Control: public, max-age=600", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/calendar?days=30");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600");
  });

  it("uses default days=30 when days is not specified", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/calendar");
    expect(res.status).toBe(200);
    const body = await res.json<{ days: number; items: unknown[] }>();
    expect(body.days).toBe(30);
  });
});

describe("GET /api/articles/:guid/neighbors", () => {
  // beforeEach で挿入される記事:
  //   g-bt-1 (google-research, 2024-04-01)
  //   o-ai-1 (openai-blog,     2024-04-02)
  //   o-ai-2 (openai-blog,     2024-04-03)

  it("returns 404 for unknown guid", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/unknown-guid-xyz/neighbors");
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("not found");
  });

  it("returns prev and next both non-null for a middle article", async () => {
    // openai-blog: o-ai-1 (04-02) < o-ai-2 (04-03) < o-ai-3 (04-04)
    await insertArticles(env.DB, [
      {
        guid: "o-ai-3",
        feed_id: "openai-blog",
        title: "AI Article Three",
        url: "https://x.test/o/3",
        summary: null,
        author: null,
        published_at: "2024-04-04T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/o-ai-2/neighbors");
    expect(res.status).toBe(200);
    const body = await res.json<{ prev: Article; next: Article }>();
    expect(body.prev).not.toBeNull();
    expect(body.next).not.toBeNull();
    expect(body.prev.guid).toBe("o-ai-1");
    expect(body.next.guid).toBe("o-ai-3");
  });

  it("returns prev=null for the oldest article in feed", async () => {
    // o-ai-1 は openai-blog で最も古い
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/neighbors");
    expect(res.status).toBe(200);
    const body = await res.json<{ prev: Article | null; next: Article | null }>();
    expect(body.prev).toBeNull();
    expect(body.next).not.toBeNull();
    expect(body.next!.guid).toBe("o-ai-2");
  });

  it("returns next=null for the newest article in feed", async () => {
    // o-ai-2 は openai-blog で最も新しい
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-2/neighbors");
    expect(res.status).toBe(200);
    const body = await res.json<{ prev: Article | null; next: Article | null }>();
    expect(body.next).toBeNull();
    expect(body.prev).not.toBeNull();
    expect(body.prev!.guid).toBe("o-ai-1");
  });

  it("tie-breaks by guid lexicographic order when published_at is identical", async () => {
    // 同一 published_at の記事を 3 件追加 (guid: tie-a, tie-b, tie-c)
    // 辞書順: tie-a < tie-b < tie-c → tie-b の prev=tie-a, next=tie-c
    const TIE_AT = "2024-05-01T00:00:00.000Z";
    await insertArticles(env.DB, [
      {
        guid: "tie-a",
        feed_id: "openai-blog",
        title: "Tie A",
        url: "https://x.test/o/tie-a",
        summary: null,
        author: null,
        published_at: TIE_AT,
        category: "ai",
        lang: "en",
      },
      {
        guid: "tie-b",
        feed_id: "openai-blog",
        title: "Tie B",
        url: "https://x.test/o/tie-b",
        summary: null,
        author: null,
        published_at: TIE_AT,
        category: "ai",
        lang: "en",
      },
      {
        guid: "tie-c",
        feed_id: "openai-blog",
        title: "Tie C",
        url: "https://x.test/o/tie-c",
        summary: null,
        author: null,
        published_at: TIE_AT,
        category: "ai",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/tie-b/neighbors");
    expect(res.status).toBe(200);
    const body = await res.json<{ prev: Article; next: Article }>();
    expect(body.prev.guid).toBe("tie-a");
    expect(body.next.guid).toBe("tie-c");
  });

  it("does not return articles from a different feed", async () => {
    // g-bt-1 は google-research フィード。openai-blog 記事は neighbors に現れない
    const res = await SELF.fetch("https://example.com/api/articles/g-bt-1/neighbors");
    expect(res.status).toBe(200);
    const body = await res.json<{ prev: Article | null; next: Article | null }>();
    // google-research には g-bt-1 のみなので両方 null
    expect(body.prev).toBeNull();
    expect(body.next).toBeNull();
  });

  it("returns Cache-Control: public, max-age=300", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/neighbors");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });

  it("returns Content-Type: application/json", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/neighbors");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
  });
});

describe("GET /api/articles/by-feed/:feedId", () => {
  it("returns 200 with articles for a known feedId", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/openai-blog");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { feed_id: string }[]; next_cursor: string | null }>();
    expect(Array.isArray(body.articles)).toBe(true);
    expect(body.articles.length).toBe(2);
    for (const article of body.articles) {
      expect(article.feed_id).toBe("openai-blog");
    }
    expect(body.next_cursor).toBeNull();
  });

  it("returns 200 with empty array when feedId has no articles", async () => {
    // 存在しない feed_id を指定 → 0 件で 200
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/nonexistent-feed-xyz");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: unknown[]; next_cursor: string | null }>();
    expect(body.articles).toEqual([]);
    expect(body.next_cursor).toBeNull();
  });

  it("returns 400 when feedId is empty", async () => {
    // Hono のルートでは /by-feed/ は別セグメントとして扱われないため
    // 空文字チェックは URL decode 後に行う
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/%20");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/feedId/);
  });

  it("returns 400 when limit=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/openai-blog?limit=0");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit=51", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/openai-blog?limit=51");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit is non-numeric", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/openai-blog?limit=abc");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when cursor is malformed", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/by-feed/openai-blog?cursor=not-valid-base64!!!",
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/cursor/);
  });

  it("returns articles in published_at DESC, id DESC order", async () => {
    // openai-blog に同一 published_at の記事を追加して tie-break を確認
    const SAME_AT = "2024-04-03T00:00:00.000Z";
    await insertArticles(env.DB, [
      {
        guid: "o-ai-tie-1",
        feed_id: "openai-blog",
        title: "Tie 1",
        url: "https://x.test/o/tie1",
        summary: null,
        author: null,
        published_at: SAME_AT,
        category: "ai",
        lang: "en",
      },
    ]);
    // o-ai-2 も SAME_AT (2024-04-03) なので tie → id DESC が効く
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/openai-blog");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { published_at: string; id: number }[] }>();
    const dates = body.articles.map((a) => a.published_at);
    const sorted = dates.toSorted((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
    // 同一 published_at 内は id DESC
    const sameAt = body.articles.filter((a) => a.published_at === SAME_AT);
    if (sameAt.length >= 2) {
      expect(sameAt[0].id).toBeGreaterThan(sameAt[1].id);
    }
  });

  it("paginates with cursor: first page + second page covers all articles", async () => {
    // openai-blog に追加で 2 件挿入して合計 4 件にする
    await insertArticles(env.DB, [
      {
        guid: "o-page-1",
        feed_id: "openai-blog",
        title: "Page Article 1",
        url: "https://x.test/o/page1",
        summary: null,
        author: null,
        published_at: "2024-04-04T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
      {
        guid: "o-page-2",
        feed_id: "openai-blog",
        title: "Page Article 2",
        url: "https://x.test/o/page2",
        summary: null,
        author: null,
        published_at: "2024-04-05T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);

    // 1 ページ目: limit=2
    const res1 = await SELF.fetch("https://example.com/api/articles/by-feed/openai-blog?limit=2");
    expect(res1.status).toBe(200);
    const body1 = await res1.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect(body1.articles.length).toBe(2);
    expect(body1.next_cursor).not.toBeNull();

    // 2 ページ目: cursor を使用
    const res2 = await SELF.fetch(
      `https://example.com/api/articles/by-feed/openai-blog?limit=2&cursor=${body1.next_cursor}`,
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect(body2.articles.length).toBe(2);
    expect(body2.next_cursor).toBeNull();

    // 2 ページ合わせて全 guid が揃う
    const allGuids = [...body1.articles.map((a) => a.guid), ...body2.articles.map((a) => a.guid)];
    expect(allGuids).toContain("o-ai-1");
    expect(allGuids).toContain("o-ai-2");
    expect(allGuids).toContain("o-page-1");
    expect(allGuids).toContain("o-page-2");
  });

  it("does not mix articles from different feed_id", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/google-research");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { feed_id: string }[] }>();
    for (const article of body.articles) {
      expect(article.feed_id).toBe("google-research");
    }
  });

  it("returns Cache-Control: public, max-age=300", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/openai-blog");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });
});

describe("GET /api/articles/by-author/:author", () => {
  it("returns 200 with articles for a known author", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/Author%20A");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { author: string }[]; next_cursor: string | null }>();
    expect(Array.isArray(body.articles)).toBe(true);
    expect(body.articles.length).toBe(1);
    expect(body.articles[0].author).toBe("Author A");
    expect(body.next_cursor).toBeNull();
  });

  it("returns 200 with empty array when author has no articles", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/NonExistentAuthor");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: unknown[]; next_cursor: string | null }>();
    expect(body.articles).toEqual([]);
    expect(body.next_cursor).toBeNull();
  });

  it("returns 400 when limit=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/Author%20A?limit=0");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit=51", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/Author%20A?limit=51");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit is non-numeric", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/Author%20A?limit=abc");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when cursor is malformed", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/by-author/Author%20A?cursor=not-valid-base64!!!",
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/cursor/);
  });

  it("decodes URL-encoded author name (space)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/Author%20A");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { author: string }[] }>();
    expect(body.articles.length).toBeGreaterThan(0);
    expect(body.articles[0].author).toBe("Author A");
  });

  it("returns articles in published_at DESC order", async () => {
    // Author B に 2 件目を追加して順序確認
    await insertArticles(env.DB, [
      {
        guid: "o-ai-10",
        feed_id: "openai-blog",
        title: "Author B Older",
        url: "https://x.test/o/10",
        summary: null,
        author: "Author B",
        published_at: "2024-03-01T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);
    const res = await SELF.fetch("https://example.com/api/articles/by-author/Author%20B");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { published_at: string }[] }>();
    expect(body.articles.length).toBe(2);
    // published_at DESC: 2024-04-02 が先
    expect(body.articles[0].published_at > body.articles[1].published_at).toBe(true);
  });

  it("paginates with cursor: first page + second page", async () => {
    // Author C に追加で 2 件挿入して合計 3 件にする
    await insertArticles(env.DB, [
      {
        guid: "o-ai-11",
        feed_id: "openai-blog",
        title: "Author C Second",
        url: "https://x.test/o/11",
        summary: null,
        author: "Author C",
        published_at: "2024-04-02T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
      {
        guid: "o-ai-12",
        feed_id: "openai-blog",
        title: "Author C Third",
        url: "https://x.test/o/12",
        summary: null,
        author: "Author C",
        published_at: "2024-04-01T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);

    // 1 ページ目: limit=2
    const res1 = await SELF.fetch("https://example.com/api/articles/by-author/Author%20C?limit=2");
    expect(res1.status).toBe(200);
    const body1 = await res1.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect(body1.articles.length).toBe(2);
    expect(body1.next_cursor).not.toBeNull();

    // 2 ページ目: cursor を使用
    const res2 = await SELF.fetch(
      `https://example.com/api/articles/by-author/Author%20C?limit=2&cursor=${body1.next_cursor}`,
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect(body2.articles.length).toBe(1);
    expect(body2.next_cursor).toBeNull();

    // 2 ページ合わせて全 guid が揃うことを確認
    const allGuids = [...body1.articles.map((a) => a.guid), ...body2.articles.map((a) => a.guid)];
    expect(allGuids).toContain("o-ai-2");
    expect(allGuids).toContain("o-ai-11");
    expect(allGuids).toContain("o-ai-12");
  });

  it("returns Cache-Control: public, max-age=300", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/Author%20A");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });
});

describe("GET /api/articles/by-category/:cat", () => {
  // beforeEach で挿入される記事:
  //   g-bt-1  (bigtech, 2024-04-01)
  //   o-ai-1  (ai,      2024-04-02)
  //   o-ai-2  (ai,      2024-04-03)

  it("returns 200 with articles for ai category", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-category/ai");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { category: string }[]; next_cursor: string | null }>();
    expect(Array.isArray(body.articles)).toBe(true);
    expect(body.articles.length).toBe(2);
    for (const article of body.articles) {
      expect(article.category).toBe("ai");
    }
    expect(body.next_cursor).toBeNull();
  });

  it("returns 200 with empty array when category has no articles", async () => {
    // zenn カテゴリの記事は beforeEach では挿入されない
    const res = await SELF.fetch("https://example.com/api/articles/by-category/zenn");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: unknown[]; next_cursor: string | null }>();
    expect(body.articles).toEqual([]);
    expect(body.next_cursor).toBeNull();
  });

  it("returns 400 for invalid category", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-category/foo");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/category/);
  });

  it("returns 400 when limit=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-category/ai?limit=0");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit=51", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-category/ai?limit=51");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit is non-numeric", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-category/ai?limit=abc");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when cursor is malformed", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/by-category/ai?cursor=not-valid-base64!!!",
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/cursor/);
  });

  it("returns articles in published_at DESC, id DESC order", async () => {
    // ai カテゴリに同一 published_at の記事を追加して tie-break を確認
    const SAME_AT = "2024-04-03T00:00:00.000Z";
    await insertArticles(env.DB, [
      {
        guid: "o-ai-tie-1",
        feed_id: "openai-blog",
        title: "Tie 1",
        url: "https://x.test/o/tie1",
        summary: null,
        author: null,
        published_at: SAME_AT,
        category: "ai",
        lang: "en",
      },
    ]);
    // o-ai-2 も SAME_AT (2024-04-03) なので tie → id DESC が効く
    const res = await SELF.fetch("https://example.com/api/articles/by-category/ai");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { published_at: string; id: number }[] }>();
    const dates = body.articles.map((a) => a.published_at);
    const sorted = dates.toSorted((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
    // 同一 published_at 内は id DESC
    const sameAt = body.articles.filter((a) => a.published_at === SAME_AT);
    if (sameAt.length >= 2) {
      expect(sameAt[0].id).toBeGreaterThan(sameAt[1].id);
    }
  });

  it("paginates with cursor: first page + second page covers all articles", async () => {
    // ai カテゴリに追加で 2 件挿入して合計 4 件にする
    await insertArticles(env.DB, [
      {
        guid: "o-page-1",
        feed_id: "openai-blog",
        title: "Page Article 1",
        url: "https://x.test/o/page1",
        summary: null,
        author: null,
        published_at: "2024-04-04T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
      {
        guid: "o-page-2",
        feed_id: "openai-blog",
        title: "Page Article 2",
        url: "https://x.test/o/page2",
        summary: null,
        author: null,
        published_at: "2024-04-05T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);

    // 1 ページ目: limit=2
    const res1 = await SELF.fetch("https://example.com/api/articles/by-category/ai?limit=2");
    expect(res1.status).toBe(200);
    const body1 = await res1.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect(body1.articles.length).toBe(2);
    expect(body1.next_cursor).not.toBeNull();

    // 2 ページ目: cursor を使用
    const res2 = await SELF.fetch(
      `https://example.com/api/articles/by-category/ai?limit=2&cursor=${body1.next_cursor}`,
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect(body2.articles.length).toBe(2);
    expect(body2.next_cursor).toBeNull();

    // 2 ページ合わせて全 guid が揃う
    const allGuids = [...body1.articles.map((a) => a.guid), ...body2.articles.map((a) => a.guid)];
    expect(allGuids).toContain("o-ai-1");
    expect(allGuids).toContain("o-ai-2");
    expect(allGuids).toContain("o-page-1");
    expect(allGuids).toContain("o-page-2");
  });

  it("does not mix articles from different categories", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-category/bigtech");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { category: string }[] }>();
    expect(body.articles.length).toBeGreaterThan(0);
    for (const article of body.articles) {
      expect(article.category).toBe("bigtech");
    }
  });

  it("returns Cache-Control: public, max-age=300", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-category/ai");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });
});

describe("GET /api/articles/popular", () => {
  it("returns 200 with default days=7 and articles/window_days/total fields", async () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    await insertArticles(env.DB, [
      {
        guid: "pop-today-1",
        feed_id: "google-research",
        title: "Popular Today 1",
        url: "https://x.test/g/pop-today-1",
        summary: null,
        author: "Author Pop",
        published_at: `${todayStr}T10:00:00.000Z`,
        category: "bigtech",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/popular");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: unknown[]; window_days: number; total: number }>();
    expect(Array.isArray(body.articles)).toBe(true);
    expect(body.window_days).toBe(7);
    expect(typeof body.total).toBe("number");
    expect(body.total).toBe(body.articles.length);
  });

  it("returns only articles within the specified days window", async () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    // 今日の記事 (days=1 の範囲内)
    await insertArticles(env.DB, [
      {
        guid: "pop-in-range",
        feed_id: "google-research",
        title: "In Range",
        url: "https://x.test/g/in-range",
        summary: null,
        author: "Author In",
        published_at: `${todayStr}T10:00:00.000Z`,
        category: "bigtech",
        lang: "en",
      },
    ]);
    // beforeEach の記事は 2024-04 のため days=1 の範囲外

    const res = await SELF.fetch("https://example.com/api/articles/popular?days=1");
    expect(res.status).toBe(200);
    const body = await res.json<{
      articles: { guid: string }[];
      window_days: number;
      total: number;
    }>();
    expect(body.window_days).toBe(1);
    // 2024-04 の古い記事は含まれない
    for (const a of body.articles) {
      expect(a.guid).toBe("pop-in-range");
    }
  });

  it("de-duplicates same feed_id + author, keeping only the newest", async () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const yesterday = new Date(today);
    yesterday.setUTCDate(today.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    await insertArticles(env.DB, [
      {
        guid: "dup-newer",
        feed_id: "openai-blog",
        title: "Dup Newer",
        url: "https://x.test/o/dup-newer",
        summary: null,
        author: "Dup Author",
        published_at: `${todayStr}T12:00:00.000Z`,
        category: "ai",
        lang: "en",
      },
      {
        guid: "dup-older",
        feed_id: "openai-blog",
        title: "Dup Older",
        url: "https://x.test/o/dup-older",
        summary: null,
        author: "Dup Author",
        published_at: `${yesterdayStr}T12:00:00.000Z`,
        category: "ai",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/popular?days=7");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { guid: string }[] }>();
    const guids = body.articles.map((a) => a.guid);
    // 同一 feed_id + author で 1 件のみ残る
    expect(guids).toContain("dup-newer");
    expect(guids).not.toContain("dup-older");
  });

  it("returns articles in published_at DESC order", async () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const yesterday = new Date(today);
    yesterday.setUTCDate(today.getUTCDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    await insertArticles(env.DB, [
      {
        guid: "ord-a",
        feed_id: "google-research",
        title: "Order A",
        url: "https://x.test/g/ord-a",
        summary: null,
        author: "Author Ord A",
        published_at: `${yesterdayStr}T10:00:00.000Z`,
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "ord-b",
        feed_id: "openai-blog",
        title: "Order B",
        url: "https://x.test/o/ord-b",
        summary: null,
        author: "Author Ord B",
        published_at: `${todayStr}T10:00:00.000Z`,
        category: "ai",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/popular?days=7");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { published_at: string }[] }>();
    const dates = body.articles.map((a) => a.published_at);
    const sorted = dates.toSorted((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
  });

  it("respects limit parameter", async () => {
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const extra = Array.from({ length: 5 }, (_, i) => ({
      guid: `pop-limit-${i}`,
      feed_id: "google-research",
      title: `Pop Limit ${i}`,
      url: `https://x.test/g/pop-limit-${i}`,
      summary: null,
      author: `Pop Author ${i}`,
      published_at: `${todayStr}T${String(i).padStart(2, "0")}:00:00.000Z`,
      category: "bigtech" as const,
      lang: "en" as const,
    }));
    await insertArticles(env.DB, extra);

    const res = await SELF.fetch("https://example.com/api/articles/popular?days=7&limit=2");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: unknown[]; total: number }>();
    expect(body.articles.length).toBe(2);
    expect(body.total).toBe(2);
  });

  it("returns 400 when days=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/popular?days=0");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid days");
  });

  it("returns 400 when days=31", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/popular?days=31");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid days");
  });

  it("returns 400 when limit=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/popular?limit=0");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid limit");
  });

  it("returns 400 when limit=101", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/popular?limit=101");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid limit");
  });

  it("returns Cache-Control: public, max-age=600", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/popular");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600");
  });

  it("returns Content-Type: application/json", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/popular");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
  });
});

describe("GET /api/articles/by-day/:date", () => {
  // beforeEach で挿入される記事:
  //   g-bt-1  (bigtech, 2024-04-01T00:00:00.000Z)
  //   o-ai-1  (ai,      2024-04-02T00:00:00.000Z)
  //   o-ai-2  (ai,      2024-04-03T00:00:00.000Z)

  it("returns 200 with articles, total, next_cursor, date for a valid date", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-day/2024-04-01");
    expect(res.status).toBe(200);
    const body = await res.json<{
      date: string;
      articles: { published_at: string }[];
      next_cursor: string | null;
      total: number;
    }>();
    expect(body.date).toBe("2024-04-01");
    expect(Array.isArray(body.articles)).toBe(true);
    expect(body.articles.length).toBe(1);
    expect(body.next_cursor).toBeNull();
    expect(body.total).toBe(1);
    // 日付境界: 2024-04-01T00:00:00 <= published_at < 2024-04-02T00:00:00
    for (const a of body.articles) {
      expect(a.published_at >= "2024-04-01T00:00:00.000Z").toBe(true);
      expect(a.published_at < "2024-04-02T00:00:00.000Z").toBe(true);
    }
  });

  it("returns empty articles and total=0 for a day with no articles", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-day/2024-04-10");
    expect(res.status).toBe(200);
    const body = await res.json<{
      date: string;
      articles: unknown[];
      next_cursor: string | null;
      total: number;
    }>();
    expect(body.date).toBe("2024-04-10");
    expect(body.articles).toEqual([]);
    expect(body.next_cursor).toBeNull();
    expect(body.total).toBe(0);
  });

  it("returns only articles from the specified day (not adjacent days)", async () => {
    // 2024-04-01 の前日・翌日の記事を追加して境界を確認
    await insertArticles(env.DB, [
      {
        guid: "boundary-prev",
        feed_id: "google-research",
        title: "Prev Day Article",
        url: "https://x.test/g/prev",
        summary: null,
        author: null,
        published_at: "2024-03-31T23:59:59.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "boundary-next",
        feed_id: "google-research",
        title: "Next Day Article",
        url: "https://x.test/g/next",
        summary: null,
        author: null,
        published_at: "2024-04-02T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/by-day/2024-04-01");
    expect(res.status).toBe(200);
    const body = await res.json<{
      articles: { guid: string }[];
      total: number;
    }>();
    expect(body.total).toBe(1);
    expect(body.articles.length).toBe(1);
    expect(body.articles[0].guid).toBe("g-bt-1");
  });

  it("returns articles in published_at DESC, id DESC order", async () => {
    // 2024-04-02 に同一時刻の記事を追加して tie-break を確認
    const SAME_AT = "2024-04-02T00:00:00.000Z";
    await insertArticles(env.DB, [
      {
        guid: "o-ai-tie-day",
        feed_id: "openai-blog",
        title: "Tie Day",
        url: "https://x.test/o/tie-day",
        summary: null,
        author: null,
        published_at: SAME_AT,
        category: "ai",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/by-day/2024-04-02");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { published_at: string; id: number }[] }>();
    const dates = body.articles.map((a) => a.published_at);
    const sorted = dates.toSorted((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
    // 同一 published_at 内は id DESC
    const sameAt = body.articles.filter((a) => a.published_at === SAME_AT);
    if (sameAt.length >= 2) {
      expect(sameAt[0].id).toBeGreaterThan(sameAt[1].id);
    }
  });

  it("paginates with cursor: first page + second page covers all articles", async () => {
    // 2024-04-05 に 3 件挿入して limit=2 でページネーション確認
    await insertArticles(env.DB, [
      {
        guid: "day-page-a",
        feed_id: "google-research",
        title: "Day Page A",
        url: "https://x.test/g/day-page-a",
        summary: null,
        author: null,
        published_at: "2024-04-05T10:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "day-page-b",
        feed_id: "google-research",
        title: "Day Page B",
        url: "https://x.test/g/day-page-b",
        summary: null,
        author: null,
        published_at: "2024-04-05T11:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "day-page-c",
        feed_id: "openai-blog",
        title: "Day Page C",
        url: "https://x.test/o/day-page-c",
        summary: null,
        author: null,
        published_at: "2024-04-05T12:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);

    // 1 ページ目: limit=2
    const res1 = await SELF.fetch("https://example.com/api/articles/by-day/2024-04-05?limit=2");
    expect(res1.status).toBe(200);
    const body1 = await res1.json<{
      date: string;
      articles: { guid: string }[];
      next_cursor: string | null;
      total: number;
    }>();
    expect(body1.articles.length).toBe(2);
    expect(body1.next_cursor).not.toBeNull();
    // total はページをまたいでも変わらない
    expect(body1.total).toBe(3);

    // 2 ページ目: cursor を使用
    const res2 = await SELF.fetch(
      `https://example.com/api/articles/by-day/2024-04-05?limit=2&cursor=${body1.next_cursor}`,
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
      total: number;
    }>();
    expect(body2.articles.length).toBe(1);
    expect(body2.next_cursor).toBeNull();
    // total は cursor 跨ぎでも同じ値
    expect(body2.total).toBe(3);

    // 2 ページ合わせて全 guid が揃う
    const allGuids = [...body1.articles.map((a) => a.guid), ...body2.articles.map((a) => a.guid)];
    expect(allGuids).toContain("day-page-a");
    expect(allGuids).toContain("day-page-b");
    expect(allGuids).toContain("day-page-c");
  });

  it("returns 400 when date is not YYYY-MM-DD format", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-day/20240401");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid date");
  });

  it("returns 400 when date has time component", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-day/2024-04-01T00:00:00");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid date");
  });

  it("returns 400 when year < 1900", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-day/1899-12-31");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid date");
  });

  it("returns 400 when year > 2100", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-day/2101-01-01");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid date");
  });

  it("returns 400 when limit=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-day/2024-04-01?limit=0");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit=101", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-day/2024-04-01?limit=101");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when cursor is malformed", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/by-day/2024-04-01?cursor=not-valid-base64!!!",
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/cursor/);
  });

  it("returns Cache-Control: public, max-age=600", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-day/2024-04-01");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=600");
  });

  it("returns Content-Type: application/json", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-day/2024-04-01");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
  });
});

describe("GET /api/articles/search", () => {
  // beforeEach で挿入される記事:
  //   g-bt-1  title="BigTech Article One"  summary="Discusses LLM optimization"
  //   o-ai-1  title="AI Article One"       summary="Discusses GPT"
  //   o-ai-2  title="AI Article Two"       summary="Discusses DALL-E"

  it("returns 400 when q is missing", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("missing q");
  });

  it("returns 400 when q is empty string", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("missing q");
  });

  it("returns 400 when q has more than 5 tokens", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=a+b+c+d+e+f");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/token/);
  });

  it("returns 400 when a token exceeds 50 characters", async () => {
    const longToken = "a".repeat(51);
    const res = await SELF.fetch(`https://example.com/api/articles/search?q=${longToken}`);
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/token/);
  });

  it("returns 400 when limit=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=ai&limit=0");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit=101", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=ai&limit=101");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when cursor is malformed", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/search?q=ai&cursor=not-valid-base64!!!",
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/cursor/);
  });

  it("returns 200 with query/tokens/articles/next_cursor fields", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=article");
    expect(res.status).toBe(200);
    const body = await res.json<{
      query: string;
      tokens: string[];
      articles: unknown[];
      next_cursor: string | null;
    }>();
    expect(body.query).toBe("article");
    expect(body.tokens).toEqual(["article"]);
    expect(Array.isArray(body.articles)).toBe(true);
    expect("next_cursor" in body).toBe(true);
  });

  it("matches articles whose title contains the keyword (case-insensitive)", async () => {
    // "bigtech" は g-bt-1 の title に含まれる
    const res = await SELF.fetch("https://example.com/api/articles/search?q=bigtech");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { guid: string }[] }>();
    expect(body.articles.some((a) => a.guid === "g-bt-1")).toBe(true);
    // ai 記事は含まれない
    expect(body.articles.every((a) => a.guid !== "o-ai-1")).toBe(true);
  });

  it("matches articles whose summary contains the keyword", async () => {
    // "gpt" は o-ai-1 の summary に含まれる
    const res = await SELF.fetch("https://example.com/api/articles/search?q=gpt");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { guid: string }[] }>();
    expect(body.articles.some((a) => a.guid === "o-ai-1")).toBe(true);
    // g-bt-1 や o-ai-2 は含まれない
    expect(body.articles.every((a) => a.guid !== "g-bt-1")).toBe(true);
    expect(body.articles.every((a) => a.guid !== "o-ai-2")).toBe(true);
  });

  it("is case-insensitive (uppercase keyword matches lowercase content)", async () => {
    // "DALL-E" → lowercase "dall-e" で o-ai-2 の summary "Discusses DALL-E" にマッチ
    const res = await SELF.fetch("https://example.com/api/articles/search?q=DALL-E");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { guid: string }[] }>();
    expect(body.articles.some((a) => a.guid === "o-ai-2")).toBe(true);
  });

  it("applies AND logic: both tokens must match", async () => {
    // "ai" は全 ai 記事に, "gpt" は o-ai-1 にのみマッチ → AND で o-ai-1 のみ
    const res = await SELF.fetch("https://example.com/api/articles/search?q=ai+gpt");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { guid: string }[] }>();
    expect(body.articles.some((a) => a.guid === "o-ai-1")).toBe(true);
    // o-ai-2 は "gpt" を含まない
    expect(body.articles.every((a) => a.guid !== "o-ai-2")).toBe(true);
  });

  it("returns empty articles when no articles match", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=xxxxxxxxnotexist");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: unknown[] }>();
    expect(body.articles).toEqual([]);
  });

  it("returns results in published_at DESC, id DESC order", async () => {
    // "article" は全 3 件の title に含まれる
    const res = await SELF.fetch("https://example.com/api/articles/search?q=article");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { published_at: string }[] }>();
    const dates = body.articles.map((a) => a.published_at);
    const sorted = dates.toSorted((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
  });

  it("paginates with cursor: first page + second page covers all articles", async () => {
    // "article" が全 3 件にマッチ。limit=2 でページネーション確認
    const res1 = await SELF.fetch("https://example.com/api/articles/search?q=article&limit=2");
    expect(res1.status).toBe(200);
    const body1 = await res1.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect(body1.articles.length).toBe(2);
    expect(body1.next_cursor).not.toBeNull();

    const res2 = await SELF.fetch(
      `https://example.com/api/articles/search?q=article&limit=2&cursor=${body1.next_cursor}`,
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect(body2.articles.length).toBe(1);
    expect(body2.next_cursor).toBeNull();

    const allGuids = [...body1.articles.map((a) => a.guid), ...body2.articles.map((a) => a.guid)];
    expect(allGuids).toContain("g-bt-1");
    expect(allGuids).toContain("o-ai-1");
    expect(allGuids).toContain("o-ai-2");
  });

  it("returns Cache-Control: public, max-age=120", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=ai");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=120");
  });

  it("returns Content-Type: application/json", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=ai");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
  });
});
