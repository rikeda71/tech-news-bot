import { describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../worker/db/articles";
import { syncFeeds, recordFetchSuccess, recordFetchError } from "../../../worker/db/feeds";
import { startRun, finishRun } from "../../../worker/db/runs";
import type { FeedConfig, FeedHealth } from "../../../worker/types";
import type { HealthResponse } from "../../../worker/api/types";

const FEED: FeedConfig = {
  id: "health-test-feed",
  name: "Health Test Feed",
  url: "https://x.test/health",
  category: "bigtech",
  lang: "en",
  enabled: true,
};

const DISABLED_FEED: FeedConfig = {
  id: "health-disabled-feed",
  name: "Health Disabled Feed",
  url: "https://x.test/health-disabled",
  category: "bigtech",
  lang: "en",
  enabled: false,
};

describe("/api/health", () => {
  it("returns 200 with ok: true", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    const body = (await res.json()) as HealthResponse;
    expect.soft(res.status).toBe(200);
    expect.soft(body.ok).toBe(true);
  });

  it("now is ISO 8601 format", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    const body = (await res.json()) as HealthResponse;
    expect(body.now).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("version is present", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    const body = (await res.json()) as HealthResponse;
    expect(body.version).toBe("0.1");
  });

  it("feeds.total and feeds.enabled are 0 when db is empty", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    const body = (await res.json()) as HealthResponse;
    expect.soft(body.feeds.total).toBe(0);
    expect.soft(body.feeds.enabled).toBe(0);
  });

  it("articles.total and articles.last_24h are 0 when db is empty", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    const body = (await res.json()) as HealthResponse;
    expect.soft(body.articles.total).toBe(0);
    expect.soft(body.articles.last_24h).toBe(0);
  });

  it("last_cron_run is null when no runs exist", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    const body = (await res.json()) as HealthResponse;
    expect(body.last_cron_run).toBeNull();
  });

  it("reflects feeds.total and feeds.enabled with fixture data", async () => {
    await syncFeeds(env.DB, [FEED, DISABLED_FEED]);

    const res = await SELF.fetch("https://example.com/api/health");
    const body = (await res.json()) as HealthResponse;
    expect.soft(body.feeds.total).toBe(2);
    expect.soft(body.feeds.enabled).toBe(1);
  });

  it("reflects articles.total and articles.last_24h with fixture data", async () => {
    await syncFeeds(env.DB, [FEED]);
    const recentAt = new Date(Date.now() - 1000 * 60 * 60).toISOString(); // 1 hour ago
    const oldAt = new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(); // 48 hours ago
    await insertArticles(env.DB, [
      {
        guid: "health-a1",
        feed_id: FEED.id,
        title: "Recent Article",
        url: "https://x.test/health/1",
        summary: null,
        author: null,
        published_at: recentAt,
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "health-a2",
        feed_id: FEED.id,
        title: "Old Article",
        url: "https://x.test/health/2",
        summary: null,
        author: null,
        published_at: oldAt,
        category: "bigtech",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/health");
    const body = (await res.json()) as HealthResponse;
    expect.soft(body.articles.total).toBe(2);
    expect.soft(body.articles.last_24h).toBe(1);
  });

  it("last_cron_run returns most recent completed run when 2 runs exist", async () => {
    const run1StartedAt = "2026-04-28T06:00:00.000Z";
    const run1CompletedAt = "2026-04-28T06:01:00.000Z";
    const run2StartedAt = "2026-04-28T09:00:00.000Z";
    const run2CompletedAt = "2026-04-28T09:01:30.000Z";

    const { run_id: id1 } = await startRun(env.DB, run1StartedAt, 40);
    await finishRun(env.DB, id1, run1CompletedAt, 38, 2, 10);

    const { run_id: id2 } = await startRun(env.DB, run2StartedAt, 41);
    await finishRun(env.DB, id2, run2CompletedAt, 39, 2, 15);

    const res = await SELF.fetch("https://example.com/api/health");
    const body = (await res.json()) as HealthResponse;

    expect(body.last_cron_run).not.toBeNull();
    expect.soft(body.last_cron_run?.completed_at).toBe(run2CompletedAt);
    expect.soft(body.last_cron_run?.feeds_total).toBe(41);
    expect.soft(body.last_cron_run?.feeds_ok).toBe(39);
    expect.soft(body.last_cron_run?.feeds_failed).toBe(2);
    expect.soft(body.last_cron_run?.articles_inserted).toBe(15);
  });

  it("last_cron_run is null when only incomplete runs exist", async () => {
    // 完了していない run (completed_at = NULL) だけ入れる
    await startRun(env.DB, "2026-04-28T09:00:00.000Z", 41);

    const res = await SELF.fetch("https://example.com/api/health");
    const body = (await res.json()) as HealthResponse;
    expect(body.last_cron_run).toBeNull();
  });

  it("sets Cache-Control: no-cache", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });
});

// feeds.yaml に実際に存在するフィード ID を使う (loadAllFeeds() が返す一覧に基づく)
// google-developers は enabled: true のフィード
const GOOGLE_DEVELOPERS_ID = "google-developers";
// zenn-mizchi は enabled: true の personal カテゴリのフィード
const PERSONAL_FEED_ID = "zenn-mizchi";

describe("GET /api/health/feeds", () => {
  it("returns 200 with an array", async () => {
    const res = await SELF.fetch("https://example.com/api/health/feeds");
    const body = (await res.json()) as unknown as FeedHealth[];
    expect.soft(res.status).toBe(200);
    expect.soft(Array.isArray(body)).toBe(true);
    // feeds.yaml に定義されたフィード数以上の要素が返る
    expect.soft(body.length).toBeGreaterThan(0);
  });

  it("returns correct shape for each entry", async () => {
    const res = await SELF.fetch("https://example.com/api/health/feeds");
    const body = (await res.json()) as unknown as FeedHealth[];
    // DB 未登録でもゼロ埋めで返る
    const found = body.find((f) => f.feed_id === GOOGLE_DEVELOPERS_ID);
    expect(found).toBeDefined();
    expect.soft(typeof found?.feed_name).toBe("string");
    expect.soft(typeof found?.enabled).toBe("boolean");
    expect.soft(found?.consecutive_failures).toBe(0);
    expect.soft(found?.articles_last_7d).toBe(0);
    expect.soft(found?.last_success_at).toBeNull();
    expect.soft(found?.last_failure_at).toBeNull();
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
    expect.soft(found?.last_success_at).toBe(successAt);
    expect.soft(found?.last_failure_at).toBeNull();
    expect.soft(found?.consecutive_failures).toBe(0);
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
    expect.soft(found?.last_failure_at).toBe(failAt);
    expect.soft(found?.consecutive_failures).toBe(2);
    expect.soft(found?.last_success_at).toBeNull();
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
    expect(ids).toContain(PERSONAL_FEED_ID);
  });

  it("sets Cache-Control: public, max-age=60", async () => {
    const res = await SELF.fetch("https://example.com/api/health/feeds");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
  });
});
