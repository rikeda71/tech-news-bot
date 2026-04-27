import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyD1Migrations, env } from "cloudflare:test";
import { deleteOlderThan, insertArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../shared/types";

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

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

beforeEach(async () => {
  await env.DB.exec("DELETE FROM articles_fts; DELETE FROM articles; DELETE FROM feeds;");
  await syncFeeds(env.DB, FEEDS);
});

describe("deleteOlderThan", () => {
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

    await deleteOlderThan(env.DB, 90);

    const remaining = await env.DB.prepare("SELECT guid FROM articles ORDER BY guid").all<{
      guid: string;
    }>();
    expect(remaining.results?.map((r) => r.guid)).toEqual(["g-recent"]);
  });

  it("is a no-op when retentionDays is invalid", async () => {
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

    await deleteOlderThan(env.DB, 0);
    await deleteOlderThan(env.DB, -1);
    await deleteOlderThan(env.DB, NaN);

    const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM articles").first<{ n: number }>();
    expect(r?.n).toBe(1);
  });
});
