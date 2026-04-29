import { beforeEach, describe, it, expect } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../../worker/db/articles";
import { insertSampleArticles } from "../../../fixtures/articles";

beforeEach(async () => {
  await insertSampleArticles();
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
