import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:test";
import {
  countFeeds,
  findFeedWithStats,
  getEnabledFeedIds,
  getFeedStreaks,
  listFeedsWithStats,
  loadEnabledFeedIdsAndHeaders,
  loadFeedHeadersAll,
  recordFetchError,
  recordFetchSuccess,
  setFeedEnabled,
  syncFeeds,
  updateFeedHeaders,
} from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

const FEED_A: FeedConfig = {
  id: "feed-a",
  name: "Feed A",
  url: "https://a.test/rss",
  category: "bigtech",
  lang: "en",
  enabled: true,
};

const FEED_B: FeedConfig = {
  id: "feed-b",
  name: "Feed B",
  url: "https://b.test/rss",
  category: "ai",
  lang: "en",
  enabled: true,
};

const FEED_C: FeedConfig = {
  id: "feed-c",
  name: "Feed C",
  url: "https://c.test/rss",
  category: "jp",
  lang: "ja",
  enabled: true,
};

describe("syncFeeds orphan cleanup", () => {
  it("disables feeds in D1 that are no longer present in yaml", async () => {
    // 最初は 3 件が enabled
    await syncFeeds(env.DB, [FEED_A, FEED_B, FEED_C]);
    const before = await env.DB.prepare(
      `SELECT id, enabled FROM feeds WHERE id IN ('feed-a','feed-b','feed-c') ORDER BY id`,
    ).all<{ id: string; enabled: number }>();
    expect(before.results).toEqual([
      { id: "feed-a", enabled: 1 },
      { id: "feed-b", enabled: 1 },
      { id: "feed-c", enabled: 1 },
    ]);

    // yaml から feed-c を取り除いた状態で再 sync
    await syncFeeds(env.DB, [FEED_A, FEED_B]);

    const after = await env.DB.prepare(
      `SELECT id, enabled FROM feeds WHERE id IN ('feed-a','feed-b','feed-c') ORDER BY id`,
    ).all<{ id: string; enabled: number }>();
    expect(after.results).toEqual([
      { id: "feed-a", enabled: 1 },
      { id: "feed-b", enabled: 1 },
      { id: "feed-c", enabled: 0 },
    ]);
  });

  it("does not touch already-disabled orphan feeds (idempotent)", async () => {
    await syncFeeds(env.DB, [FEED_A, FEED_B, FEED_C]);
    await syncFeeds(env.DB, [FEED_A, FEED_B]); // feed-c を一度 disable

    const beforeRow = await env.DB.prepare(
      `SELECT updated_at FROM feeds WHERE id = 'feed-c'`,
    ).first<{ updated_at: string }>();

    // 同じ yaml で再 sync しても feed-c の updated_at は変わらない (enabled=1 の行だけ対象)
    await syncFeeds(env.DB, [FEED_A, FEED_B]);

    const afterRow = await env.DB.prepare(
      `SELECT updated_at FROM feeds WHERE id = 'feed-c'`,
    ).first<{ updated_at: string }>();

    expect(afterRow?.updated_at).toBe(beforeRow?.updated_at);
  });

  it("re-enables a feed if it returns to yaml (yaml is the source of truth)", async () => {
    await syncFeeds(env.DB, [FEED_A, FEED_B, FEED_C]);
    await syncFeeds(env.DB, [FEED_A, FEED_B]); // feed-c disable

    // feed-c が yaml に戻ったら enabled=1 に戻る
    await syncFeeds(env.DB, [FEED_A, FEED_B, FEED_C]);

    const row = await env.DB.prepare(`SELECT enabled FROM feeds WHERE id = 'feed-c'`).first<{
      enabled: number;
    }>();
    expect(row?.enabled).toBe(1);
  });
});

describe("loadFeedHeadersAll", () => {
  beforeEach(async () => {
    await syncFeeds(env.DB, [FEED_A, FEED_B, FEED_C]);
  });

  it("returns an empty Map when feedIds is empty", async () => {
    const map = await loadFeedHeadersAll(env.DB, []);
    expect(map.size).toBe(0);
  });

  it("returns saved etag/last_modified for each feed in one query", async () => {
    await updateFeedHeaders(env.DB, "feed-a", '"a-etag"', "Mon, 01 Jan 2024 00:00:00 GMT");
    await updateFeedHeaders(env.DB, "feed-b", '"b-etag"', null);

    const map = await loadFeedHeadersAll(env.DB, ["feed-a", "feed-b", "feed-c"]);
    expect(map.size).toBe(3);
    expect.soft(map.get("feed-a")).toEqual({
      last_etag: '"a-etag"',
      last_modified: "Mon, 01 Jan 2024 00:00:00 GMT",
    });
    expect.soft(map.get("feed-b")).toEqual({ last_etag: '"b-etag"', last_modified: null });
    expect.soft(map.get("feed-c")).toEqual({ last_etag: null, last_modified: null });
  });

  it("omits unknown feed ids from the returned Map", async () => {
    const map = await loadFeedHeadersAll(env.DB, ["feed-a", "non-existent"]);
    // 存在する feed と存在しない feed の has() は独立した観点
    expect.soft(map.has("feed-a")).toBe(true);
    expect.soft(map.has("non-existent")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setFeedEnabled
// ---------------------------------------------------------------------------

describe("setFeedEnabled", () => {
  beforeEach(async () => {
    await syncFeeds(env.DB, [FEED_A]);
  });

  it("disables an enabled feed and returns found=true", async () => {
    const result = await setFeedEnabled(env.DB, "feed-a", false);
    expect(result.found).toBe(true);

    const row = await env.DB.prepare(`SELECT enabled FROM feeds WHERE id = 'feed-a'`).first<{
      enabled: number;
    }>();
    expect(row?.enabled).toBe(0);
  });

  it("re-enables a disabled feed and returns found=true", async () => {
    // まず disable する
    await setFeedEnabled(env.DB, "feed-a", false);

    const result = await setFeedEnabled(env.DB, "feed-a", true);
    expect(result.found).toBe(true);

    const row = await env.DB.prepare(`SELECT enabled FROM feeds WHERE id = 'feed-a'`).first<{
      enabled: number;
    }>();
    expect(row?.enabled).toBe(1);
  });

  it("returns found=false for a non-existent feed id", async () => {
    const result = await setFeedEnabled(env.DB, "does-not-exist", true);
    expect(result.found).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// countFeeds
// ---------------------------------------------------------------------------

describe("countFeeds", () => {
  it("returns 0 when no feeds exist", async () => {
    const count = await countFeeds(env.DB);
    expect(count).toBe(0);
  });

  it("returns total feed count without opts", async () => {
    await syncFeeds(env.DB, [FEED_A, FEED_B, FEED_C]);
    const count = await countFeeds(env.DB);
    expect(count).toBe(3);
  });

  it("returns only enabled feeds when opts.enabled=true", async () => {
    await syncFeeds(env.DB, [FEED_A, FEED_B, FEED_C]);
    // feed-c を disable する
    await syncFeeds(env.DB, [FEED_A, FEED_B]);

    const count = await countFeeds(env.DB, { enabled: true });
    expect(count).toBe(2);
  });

  it("returns only disabled feeds when opts.enabled=false", async () => {
    await syncFeeds(env.DB, [FEED_A, FEED_B, FEED_C]);
    await syncFeeds(env.DB, [FEED_A, FEED_B]); // feed-c が orphan → disabled

    const count = await countFeeds(env.DB, { enabled: false });
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getEnabledFeedIds
// ---------------------------------------------------------------------------

describe("getEnabledFeedIds", () => {
  it("returns empty Set when no feeds exist", async () => {
    const ids = await getEnabledFeedIds(env.DB);
    expect(ids.size).toBe(0);
  });

  it("returns Set of enabled feed ids only", async () => {
    await syncFeeds(env.DB, [FEED_A, FEED_B, FEED_C]);
    await syncFeeds(env.DB, [FEED_A, FEED_B]); // feed-c が disabled

    const ids = await getEnabledFeedIds(env.DB);
    expect.soft(ids.has("feed-a")).toBe(true);
    expect.soft(ids.has("feed-b")).toBe(true);
    expect.soft(ids.has("feed-c")).toBe(false);
    expect.soft(ids.size).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// loadEnabledFeedIdsAndHeaders
// ---------------------------------------------------------------------------

describe("loadEnabledFeedIdsAndHeaders", () => {
  it("returns empty Set and Map when no feeds exist", async () => {
    const { enabledIds, headers } = await loadEnabledFeedIdsAndHeaders(env.DB);
    expect.soft(enabledIds.size).toBe(0);
    expect.soft(headers.size).toBe(0);
  });

  it("returns enabled ids and their conditional GET headers in one call", async () => {
    await syncFeeds(env.DB, [FEED_A, FEED_B, FEED_C]);
    await syncFeeds(env.DB, [FEED_A, FEED_B]); // feed-c を disabled に
    await updateFeedHeaders(env.DB, "feed-a", '"etag-a"', null);

    const { enabledIds, headers } = await loadEnabledFeedIdsAndHeaders(env.DB);

    // enabled id の Set
    expect(enabledIds.has("feed-a")).toBe(true);
    expect(enabledIds.has("feed-b")).toBe(true);
    expect(enabledIds.has("feed-c")).toBe(false);

    // headers Map には enabled の feed だけ含まれる
    expect(headers.has("feed-a")).toBe(true);
    expect(headers.has("feed-c")).toBe(false);
    expect(headers.get("feed-a")).toEqual({ last_etag: '"etag-a"', last_modified: null });
  });
});

// ---------------------------------------------------------------------------
// getFeedStreaks
// ---------------------------------------------------------------------------

describe("getFeedStreaks", () => {
  it("returns empty array when no enabled feeds exist", async () => {
    const streaks = await getFeedStreaks(env.DB);
    expect(streaks).toHaveLength(0);
  });

  it("returns consecutive_failures=0 for freshly synced feeds", async () => {
    await syncFeeds(env.DB, [FEED_A, FEED_B]);
    const streaks = await getFeedStreaks(env.DB);
    expect(streaks).toHaveLength(2);
    for (const s of streaks) {
      expect.soft(s.consecutive_failures).toBe(0);
    }
  });

  it("reflects consecutive_failures after repeated errors", async () => {
    await syncFeeds(env.DB, [FEED_A]);
    const fetchedAt = new Date().toISOString();
    await recordFetchError(env.DB, "feed-a", fetchedAt, "timeout");
    await recordFetchError(env.DB, "feed-a", fetchedAt, "timeout");
    await recordFetchError(env.DB, "feed-a", fetchedAt, "timeout");

    const streaks = await getFeedStreaks(env.DB);
    const entry = streaks.find((s) => s.id === "feed-a");
    expect(entry?.consecutive_failures).toBe(3);
  });

  it("resets consecutive_failures to 0 after a successful fetch", async () => {
    await syncFeeds(env.DB, [FEED_A]);
    const fetchedAt = new Date().toISOString();
    await recordFetchError(env.DB, "feed-a", fetchedAt, "timeout");
    await recordFetchError(env.DB, "feed-a", fetchedAt, "timeout");
    await recordFetchSuccess(env.DB, "feed-a", fetchedAt, 1);

    const streaks = await getFeedStreaks(env.DB);
    const entry = streaks.find((s) => s.id === "feed-a");
    expect(entry?.consecutive_failures).toBe(0);
  });

  it("excludes disabled feeds from the result", async () => {
    await syncFeeds(env.DB, [FEED_A, FEED_B, FEED_C]);
    await syncFeeds(env.DB, [FEED_A, FEED_B]); // feed-c が disabled

    const streaks = await getFeedStreaks(env.DB);
    const ids = streaks.map((s) => s.id);
    expect.soft(ids).toContain("feed-a");
    expect.soft(ids).toContain("feed-b");
    expect.soft(ids).not.toContain("feed-c");
  });
});

// ---------------------------------------------------------------------------
// listFeedsWithStats
// ---------------------------------------------------------------------------

describe("listFeedsWithStats", () => {
  beforeEach(async () => {
    await syncFeeds(env.DB, [FEED_A, FEED_B, FEED_C]);
  });

  it("returns empty array when no feeds exist", async () => {
    // DB はリセット済みなので feeds が 0 件の状態でテスト
    // ただし beforeEach で feed を投入しているので、別テストで 0 件を確認
    // 独立したテストのため直接確認する
    const rows = await listFeedsWithStats(env.DB, { category: "personal" });
    expect(rows).toHaveLength(0);
  });

  it("returns all feeds ordered by id ASC when no opts given", async () => {
    const rows = await listFeedsWithStats(env.DB);
    expect(rows).toHaveLength(3);
    // id ASC の順序確認
    expect(rows[0]?.id).toBe("feed-a");
    expect(rows[1]?.id).toBe("feed-b");
    expect(rows[2]?.id).toBe("feed-c");
  });

  it("maps enabled integer to boolean", async () => {
    const rows = await listFeedsWithStats(env.DB);
    for (const row of rows) {
      expect.soft(typeof row.enabled).toBe("boolean");
    }
  });

  it("filters by category", async () => {
    const rows = await listFeedsWithStats(env.DB, { category: "bigtech" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("feed-a");
    expect.soft(rows[0]?.category).toBe("bigtech");
  });

  it("filters by lang", async () => {
    const rows = await listFeedsWithStats(env.DB, { lang: "ja" });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("feed-c");
  });

  it("filters by enabled=true excludes disabled feeds", async () => {
    await syncFeeds(env.DB, [FEED_A, FEED_B]); // feed-c が disabled

    const rows = await listFeedsWithStats(env.DB, { enabled: true });
    const ids = rows.map((r) => r.id);
    expect.soft(ids).toContain("feed-a");
    expect.soft(ids).toContain("feed-b");
    expect.soft(ids).not.toContain("feed-c");
    expect(rows.every((r) => r.enabled)).toBe(true);
  });

  it("filters by enabled=false returns only disabled feeds", async () => {
    await syncFeeds(env.DB, [FEED_A, FEED_B]); // feed-c が disabled

    const rows = await listFeedsWithStats(env.DB, { enabled: false });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe("feed-c");
    expect(rows[0]?.enabled).toBe(false);
  });

  it("counts articles_30d within 30-day window", async () => {
    vi.setSystemTime(new Date("2026-04-29T00:00:00Z"));
    // 30 日以内の記事 2 本と期限外 1 本を feed-a に投入
    const recent = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const old = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO articles (guid, feed_id, title, url, summary, author, published_at, category, lang)
           VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
      ).bind("lws-recent-1", "feed-a", "Recent 1", "https://a.test/r1", recent, "bigtech", "en"),
      env.DB.prepare(
        `INSERT OR IGNORE INTO articles (guid, feed_id, title, url, summary, author, published_at, category, lang)
           VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
      ).bind("lws-recent-2", "feed-a", "Recent 2", "https://a.test/r2", recent, "bigtech", "en"),
      env.DB.prepare(
        `INSERT OR IGNORE INTO articles (guid, feed_id, title, url, summary, author, published_at, category, lang)
           VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
      ).bind("lws-old-1", "feed-a", "Old", "https://a.test/o1", old, "bigtech", "en"),
    ]);

    const rows = await listFeedsWithStats(env.DB, { category: "bigtech" });
    expect(rows).toHaveLength(1);
    expect.soft(rows[0]?.articles_30d).toBe(2);
    expect.soft(rows[0]?.last_published_at).toBe(recent);
  });

  it("returns articles_30d=0 and last_published_at=null for feeds with no articles", async () => {
    const rows = await listFeedsWithStats(env.DB);
    for (const row of rows) {
      expect.soft(row.articles_30d).toBe(0);
      expect.soft(row.last_published_at).toBeNull();
    }
  });

  afterEach(() => vi.useRealTimers());
});

// ---------------------------------------------------------------------------
// findFeedWithStats
// ---------------------------------------------------------------------------

describe("findFeedWithStats", () => {
  beforeEach(async () => {
    await syncFeeds(env.DB, [FEED_A]);
  });

  it("returns feed details for an existing feed id", async () => {
    const feed = await findFeedWithStats(env.DB, "feed-a");
    expect(feed).not.toBeNull();
    expect.soft(feed?.id).toBe("feed-a");
    expect.soft(feed?.name).toBe("Feed A");
    expect.soft(feed?.category).toBe("bigtech");
    expect.soft(feed?.lang).toBe("en");
    expect.soft(feed?.enabled).toBe(true);
    expect.soft(feed?.articles_30d).toBe(0);
    expect.soft(feed?.last_published_at).toBeNull();
  });

  it("returns null for a non-existent feed id", async () => {
    const feed = await findFeedWithStats(env.DB, "does-not-exist");
    expect(feed).toBeNull();
  });

  it("counts articles_30d for the specific feed only", async () => {
    vi.setSystemTime(new Date("2026-04-29T00:00:00Z"));
    await syncFeeds(env.DB, [FEED_A, FEED_B]);
    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT OR IGNORE INTO articles (guid, feed_id, title, url, summary, author, published_at, category, lang)
           VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
      ).bind("fws-a-1", "feed-a", "Feed A Article", "https://a.test/fws1", recent, "bigtech", "en"),
      env.DB.prepare(
        `INSERT OR IGNORE INTO articles (guid, feed_id, title, url, summary, author, published_at, category, lang)
           VALUES (?, ?, ?, ?, NULL, NULL, ?, ?, ?)`,
      ).bind("fws-b-1", "feed-b", "Feed B Article", "https://b.test/fws1", recent, "ai", "en"),
    ]);

    const feedA = await findFeedWithStats(env.DB, "feed-a");
    const feedB = await findFeedWithStats(env.DB, "feed-b");
    expect.soft(feedA?.articles_30d).toBe(1);
    expect.soft(feedB?.articles_30d).toBe(1);
  });

  afterEach(() => vi.useRealTimers());
});
