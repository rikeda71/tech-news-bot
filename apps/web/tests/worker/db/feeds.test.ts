import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:test";
import { loadFeedHeadersAll, syncFeeds, updateFeedHeaders } from "../../../worker/db/feeds";
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
    expect(map.get("feed-a")).toEqual({
      last_etag: '"a-etag"',
      last_modified: "Mon, 01 Jan 2024 00:00:00 GMT",
    });
    expect(map.get("feed-b")).toEqual({ last_etag: '"b-etag"', last_modified: null });
    expect(map.get("feed-c")).toEqual({ last_etag: null, last_modified: null });
  });

  it("omits unknown feed ids from the returned Map", async () => {
    const map = await loadFeedHeadersAll(env.DB, ["feed-a", "non-existent"]);
    expect(map.has("feed-a")).toBe(true);
    expect(map.has("non-existent")).toBe(false);
  });
});
