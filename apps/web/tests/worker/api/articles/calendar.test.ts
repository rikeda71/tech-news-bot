import { beforeEach, describe, it, expect } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../../worker/db/articles";
import { insertSampleArticles } from "../../../fixtures/articles";

beforeEach(async () => {
  await insertSampleArticles();
});

describe("GET /api/articles/calendar", () => {
  it("returns 200 with empty items when no articles in range", async () => {
    // beforeEach の記事は 2024-04 のため、days=30 (今から 30 日以内) では 0 件
    const res = await SELF.fetch("https://example.com/api/articles/calendar?days=30");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ days: number; items: unknown[] }>();
    expect.soft(body.days).toBe(30);
    expect.soft(Array.isArray(body.items)).toBe(true);
    // 2024-04 の記事は今から 30 日以内に含まれないので空
    expect.soft(body.items.length).toBe(0);
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
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ days: number; items: { date: string; count: number }[] }>();
    expect.soft(body.days).toBe(7);

    const todayItem = body.items.find((i) => i.date === todayStr);
    const yesterdayItem = body.items.find((i) => i.date === yesterdayStr);
    expect.soft(todayItem?.count).toBe(2);
    expect.soft(yesterdayItem?.count).toBe(1);
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
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ items: { date: string; count: number }[] }>();
    const dates = body.items.map((i) => i.date);
    const sorted = dates.toSorted((a, b) => a.localeCompare(b));
    expect.soft(dates).toEqual(sorted);
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
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ items: { date: string; count: number }[] }>();
    const todayItem = body.items.find((i) => i.date === todayStr);
    // ja のみ: 1 件
    expect.soft(todayItem?.count).toBe(1);
    // en の記事は含まれないので total count は 1
    const totalCount = body.items.reduce((s, i) => s + i.count, 0);
    expect.soft(totalCount).toBe(1);
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
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ items: { date: string; count: number }[] }>();
    const todayItem = body.items.find((i) => i.date === todayStr);
    // ai のみ: 1 件
    expect.soft(todayItem?.count).toBe(1);
    const totalCount = body.items.reduce((s, i) => s + i.count, 0);
    expect.soft(totalCount).toBe(1);
  });

  it("returns 400 for days=10 (not in allowed values)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/calendar?days=10");
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toContain("days");
  });

  it("returns 400 for lang=fr (invalid)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/calendar?lang=fr");
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toContain("lang");
  });

  it("returns 400 for category=invalid", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/calendar?category=invalid");
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toContain("category");
  });

  it("returns Cache-Control: public, max-age=600", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/calendar?days=30");
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Cache-Control")).toContain("max-age=600");
  });

  it("uses default days=30 when days is not specified", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/calendar");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ days: number; items: unknown[] }>();
    expect.soft(body.days).toBe(30);
  });
});
