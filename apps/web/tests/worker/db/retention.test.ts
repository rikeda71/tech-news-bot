import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:test";
import { pruneOldArticles } from "../../../worker/db/retention";
import { insertArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

const FEEDS: FeedConfig[] = [
  {
    id: "f-a",
    name: "F A",
    url: "https://x.test/a",
    category: "bigtech",
    lang: "en",
    enabled: true,
  },
];

beforeEach(async () => {
  await syncFeeds(env.DB, FEEDS);
});

describe("pruneOldArticles", () => {
  it("removes articles older than the retention window", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 100 * 86400 * 1000).toISOString();
    const recent = new Date(now.getTime() - 5 * 86400 * 1000).toISOString();

    await insertArticles(env.DB, [
      {
        guid: "g-old",
        feed_id: "f-a",
        title: "old",
        url: "https://x.test/a/old",
        summary: null,
        author: null,
        published_at: old,
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "g-recent",
        feed_id: "f-a",
        title: "recent",
        url: "https://x.test/a/recent",
        summary: null,
        author: null,
        published_at: recent,
        category: "bigtech",
        lang: "en",
      },
    ]);

    const result = await pruneOldArticles(env.DB, 90);

    expect(result.deleted).toBe(1);
    const remaining = await env.DB.prepare("SELECT guid FROM articles ORDER BY guid").all<{
      guid: string;
    }>();
    expect(remaining.results?.map((r) => r.guid)).toEqual(["g-recent"]);
  });

  it("is a no-op when days is 0", async () => {
    await insertArticles(env.DB, [
      {
        guid: "g1",
        feed_id: "f-a",
        title: "t",
        url: "https://x.test/a/1",
        summary: null,
        author: null,
        published_at: "2020-01-01T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
    ]);

    const result = await pruneOldArticles(env.DB, 0);

    expect(result.deleted).toBe(0);
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM articles").first<{ n: number }>();
    expect(r?.n).toBe(1);
  });

  it("is a no-op when days is negative", async () => {
    await insertArticles(env.DB, [
      {
        guid: "g2",
        feed_id: "f-a",
        title: "t",
        url: "https://x.test/a/2",
        summary: null,
        author: null,
        published_at: "2020-01-01T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
    ]);

    const result = await pruneOldArticles(env.DB, -1);

    expect(result.deleted).toBe(0);
    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM articles").first<{ n: number }>();
    expect(r?.n).toBe(1);
  });
});
