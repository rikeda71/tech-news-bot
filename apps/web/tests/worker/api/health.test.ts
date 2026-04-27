import { describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../worker/db/articles";
import { syncFeeds, recordFetchSuccess, recordFetchError } from "../../../worker/db/feeds";
import type { FeedConfig, FeedHealth } from "../../../worker/types";

const FEED: FeedConfig = {
  id: "health-test-feed",
  name: "Health Test Feed",
  url: "https://x.test/health",
  category: "bigtech",
  lang: "en",
  enabled: true,
};

describe("/api/health enriched response", () => {
  it("returns 200 with correct shape when db is empty", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      now: string;
      db: {
        articles_total: number;
        feeds_total: number;
        feeds_enabled: number;
        latest_published_at: string | null;
        latest_fetched_at: string | null;
      };
    };
    expect(body.status).toBe("ok");
    expect(typeof body.now).toBe("string");
    // empty db: latest_* must be null
    expect(body.db.articles_total).toBe(0);
    expect(body.db.latest_published_at).toBeNull();
    expect(body.db.latest_fetched_at).toBeNull();
  });

  it("reflects inserted article and feed counts", async () => {
    await syncFeeds(env.DB, [FEED]);
    await insertArticles(env.DB, [
      {
        guid: "health-a1",
        feed_id: "health-test-feed",
        title: "Health Article",
        url: "https://x.test/health/1",
        summary: null,
        author: null,
        published_at: "2026-04-28T10:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      status: string;
      now: string;
      db: {
        articles_total: number;
        feeds_total: number;
        feeds_enabled: number;
        latest_published_at: string | null;
        latest_fetched_at: string | null;
      };
    };
    expect(body.status).toBe("ok");
    expect(body.db.articles_total).toBe(1);
    expect(body.db.feeds_total).toBe(1);
    expect(body.db.feeds_enabled).toBe(1);
    expect(body.db.latest_published_at).toBe("2026-04-28T10:00:00.000Z");
  });

  it("counts disabled feeds separately", async () => {
    const disabledFeed: FeedConfig = { ...FEED, id: "health-disabled-feed", enabled: false };
    await syncFeeds(env.DB, [FEED, disabledFeed]);

    const res = await SELF.fetch("https://example.com/api/health");
    const body = (await res.json()) as {
      db: { feeds_total: number; feeds_enabled: number };
    };
    expect(body.db.feeds_total).toBe(2);
    expect(body.db.feeds_enabled).toBe(1);
  });

  it("sets Cache-Control: public, max-age=10", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=10");
  });
});

// feeds.yaml に実際に存在するフィード ID を使う (loadAllFeeds() が返す一覧に基づく)
// google-developers は enabled: true のフィード
const GOOGLE_DEVELOPERS_ID = "google-developers";
// zenn-trending は enabled: true の Zenn フィード
const ZENN_TRENDING_ID = "zenn-trending";

describe("GET /api/health/feeds", () => {
  it("returns 200 with an array", async () => {
    const res = await SELF.fetch("https://example.com/api/health/feeds");
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown as FeedHealth[];
    expect(Array.isArray(body)).toBe(true);
    // feeds.yaml に定義されたフィード数以上の要素が返る
    expect(body.length).toBeGreaterThan(0);
  });

  it("returns correct shape for each entry", async () => {
    const res = await SELF.fetch("https://example.com/api/health/feeds");
    const body = (await res.json()) as unknown as FeedHealth[];
    // DB 未登録でもゼロ埋めで返る
    const found = body.find((f) => f.feed_id === GOOGLE_DEVELOPERS_ID);
    expect(found).toBeDefined();
    expect(typeof found?.feed_name).toBe("string");
    expect(typeof found?.enabled).toBe("boolean");
    expect(found?.consecutive_failures).toBe(0);
    expect(found?.articles_last_7d).toBe(0);
    expect(found?.last_success_at).toBeNull();
    expect(found?.last_failure_at).toBeNull();
  });

  it("reflects last_success_at after recordFetchSuccess", async () => {
    // DB にフィードを登録してから success を記録する
    const feed: FeedConfig = {
      id: GOOGLE_DEVELOPERS_ID,
      name: "Google Developers Blog",
      url: "https://developers.googleblog.com/feeds/posts/default",
      category: "bigtech",
      lang: "en",
      enabled: true,
    };
    await syncFeeds(env.DB, [feed]);
    const successAt = "2026-04-28T03:00:00.000Z";
    await recordFetchSuccess(env.DB, GOOGLE_DEVELOPERS_ID, successAt, 5);

    const res = await SELF.fetch("https://example.com/api/health/feeds");
    const body = (await res.json()) as unknown as FeedHealth[];
    const found = body.find((f) => f.feed_id === GOOGLE_DEVELOPERS_ID);
    expect(found?.last_success_at).toBe(successAt);
    expect(found?.last_failure_at).toBeNull();
    expect(found?.consecutive_failures).toBe(0);
  });

  it("reflects last_failure_at and consecutive_failures after recordFetchError", async () => {
    const feed: FeedConfig = {
      id: GOOGLE_DEVELOPERS_ID,
      name: "Google Developers Blog",
      url: "https://developers.googleblog.com/feeds/posts/default",
      category: "bigtech",
      lang: "en",
      enabled: true,
    };
    await syncFeeds(env.DB, [feed]);
    const failAt = "2026-04-28T06:00:00.000Z";
    await recordFetchError(env.DB, GOOGLE_DEVELOPERS_ID, failAt, "timeout");
    await recordFetchError(env.DB, GOOGLE_DEVELOPERS_ID, failAt, "timeout");

    const res = await SELF.fetch("https://example.com/api/health/feeds");
    const body = (await res.json()) as unknown as FeedHealth[];
    const found = body.find((f) => f.feed_id === GOOGLE_DEVELOPERS_ID);
    expect(found?.last_failure_at).toBe(failAt);
    expect(found?.consecutive_failures).toBe(2);
    expect(found?.last_success_at).toBeNull();
  });

  it("counts only articles published within the last 7 days", async () => {
    const feed: FeedConfig = {
      id: GOOGLE_DEVELOPERS_ID,
      name: "Google Developers Blog",
      url: "https://developers.googleblog.com/feeds/posts/default",
      category: "bigtech",
      lang: "en",
      enabled: true,
    };
    await syncFeeds(env.DB, [feed]);
    await insertArticles(env.DB, [
      {
        guid: "fh-recent",
        feed_id: GOOGLE_DEVELOPERS_ID,
        title: "Recent Article",
        url: "https://x.test/fh-recent",
        summary: null,
        author: null,
        // SQLite の datetime('now','-7 days') より新しい日付
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "fh-old",
        feed_id: GOOGLE_DEVELOPERS_ID,
        title: "Old Article",
        url: "https://x.test/fh-old",
        summary: null,
        author: null,
        // 8 日前: 7 日以内に含まれない
        published_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 8).toISOString(),
        category: "bigtech",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/health/feeds");
    const body = (await res.json()) as unknown as FeedHealth[];
    const found = body.find((f) => f.feed_id === GOOGLE_DEVELOPERS_ID);
    // 直近 7 日は 1 件のみ
    expect(found?.articles_last_7d).toBe(1);
  });

  it("includes feeds.yaml disabled entries with enabled=false", async () => {
    const res = await SELF.fetch("https://example.com/api/health/feeds");
    const body = (await res.json()) as unknown as FeedHealth[];
    // feeds.yaml の全フィードが含まれることを確認 (enabled/disabled 問わず)
    const ids = body.map((f) => f.feed_id);
    expect(ids).toContain(GOOGLE_DEVELOPERS_ID);
    expect(ids).toContain(ZENN_TRENDING_ID);
  });

  it("sets Cache-Control: public, max-age=60", async () => {
    const res = await SELF.fetch("https://example.com/api/health/feeds");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
  });
});
