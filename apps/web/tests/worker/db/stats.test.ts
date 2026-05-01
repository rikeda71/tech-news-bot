import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:test";
import { insertArticles } from "../../../worker/db/articles";
import { getHealthArticleStats } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

const FEED: FeedConfig = {
  id: "stats-test-feed",
  name: "Stats Test Feed",
  url: "https://x.test/stats",
  category: "bigtech",
  lang: "en",
  enabled: true,
};

beforeEach(async () => {
  await syncFeeds(env.DB, [FEED]);
});

describe("getHealthArticleStats", () => {
  it("returns total=0 and since=0 when no articles exist", async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = await getHealthArticleStats(env.DB, since);
    expect.soft(result.total).toBe(0);
    expect.soft(result.since).toBe(0);
  });

  it("counts all articles in total regardless of date", async () => {
    const oldAt = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const recentAt = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    await insertArticles(env.DB, [
      {
        guid: "s-old",
        feed_id: FEED.id,
        title: "Old",
        url: "https://x.test/old",
        summary: null,
        author: null,
        published_at: oldAt,
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "s-recent",
        feed_id: FEED.id,
        title: "Recent",
        url: "https://x.test/recent",
        summary: null,
        author: null,
        published_at: recentAt,
        category: "bigtech",
        lang: "en",
      },
    ]);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = await getHealthArticleStats(env.DB, since);
    expect.soft(result.total).toBe(2);
    expect.soft(result.since).toBe(1);
  });

  it("counts only articles at or after the since boundary in the since field", async () => {
    // 厳密に境界値を確認する: since 時刻と同一の記事は含まれる (>= )
    const boundary = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await insertArticles(env.DB, [
      {
        guid: "s-boundary",
        feed_id: FEED.id,
        title: "Boundary",
        url: "https://x.test/boundary",
        summary: null,
        author: null,
        published_at: boundary,
        category: "bigtech",
        lang: "en",
      },
    ]);

    const result = await getHealthArticleStats(env.DB, boundary);
    expect.soft(result.total).toBe(1);
    expect.soft(result.since).toBe(1);
  });

  it("returns since=0 when all articles are older than the boundary", async () => {
    const veryOld = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    await insertArticles(env.DB, [
      {
        guid: "s-very-old",
        feed_id: FEED.id,
        title: "Very Old",
        url: "https://x.test/very-old",
        summary: null,
        author: null,
        published_at: veryOld,
        category: "bigtech",
        lang: "en",
      },
    ]);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const result = await getHealthArticleStats(env.DB, since);
    expect.soft(result.total).toBe(1);
    expect.soft(result.since).toBe(0);
  });
});
