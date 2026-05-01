import { beforeEach, describe, it, expect } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../../worker/db/articles";
import { insertSampleArticles } from "../../../fixtures/articles";

beforeEach(async () => {
  await insertSampleArticles();
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
    expect.soft(res.status).toBe(200);
    const body = await res.json<{
      year: number;
      month: number;
      items: { published_at: string }[];
      total: number;
    }>();
    expect.soft(body.year).toBe(2024);
    expect.soft(body.month).toBe(4);
    expect.soft(body.total).toBe(3);
    expect.soft(body.items.length).toBe(3);
    for (const item of body.items) {
      expect.soft(item.published_at >= "2024-04-01T00:00:00.000Z").toBe(true);
      expect.soft(item.published_at < "2024-05-01T00:00:00.000Z").toBe(true);
    }
  });

  it("returns items in published_at descending order", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/archive?year=2024&month=4");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ items: { published_at: string }[] }>();
    const dates = body.items.map((a) => a.published_at);
    const sorted = dates.toSorted((a, b) => b.localeCompare(a));
    expect.soft(dates).toEqual(sorted);
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
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ items: unknown[]; total: number }>();
    expect.soft(body.items.length).toBe(10);
    expect.soft(body.total).toBe(15);
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
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ items: { published_at: string }[]; total: number }>();
    expect.soft(body.total).toBe(1);
    // items[0] へのアクセスは length > 0 が前提のため fail-fast で確認
    expect(body.items.length).toBe(1);
    expect.soft(body.items[0].published_at).toBe("2025-12-15T12:00:00.000Z");
  });

  it("returns Cache-Control: public, max-age=600", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/archive?year=2024&month=4");
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Cache-Control")).toContain("max-age=600");
  });

  it("returns Content-Type application/json", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/archive?year=2024&month=4");
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toMatch(/application\/json/);
  });

  it("filters by year + month + category simultaneously", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/archive?year=2024&month=4&category=ai",
    );
    expect.soft(res.status).toBe(200);
    const body = await res.json<{
      items: { category: string; published_at: string }[];
      total: number;
    }>();
    // 2024-04 に ai が 2 件 (o-ai-1, o-ai-2)
    expect.soft(body.total).toBe(2);
    for (const item of body.items) {
      expect.soft(item.category).toBe("ai");
    }
  });
});
