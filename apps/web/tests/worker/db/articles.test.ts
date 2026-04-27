import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:test";
import { insertArticles, listArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

const FEEDS: FeedConfig[] = [
  {
    id: "feed-a",
    name: "Feed A",
    url: "https://a.test/rss",
    category: "bigtech",
    lang: "en",
    enabled: true,
  },
  {
    id: "feed-b",
    name: "Feed B",
    url: "https://b.test/rss",
    category: "ai",
    lang: "en",
    enabled: true,
  },
];

beforeEach(async () => {
  await syncFeeds(env.DB, FEEDS);
});

describe("articles db", () => {
  it("inserts new rows and skips duplicates by guid", async () => {
    const inserted1 = await insertArticles(env.DB, [
      {
        guid: "g1",
        feed_id: "feed-a",
        title: "T1",
        url: "https://a.test/1",
        summary: "s1",
        author: null,
        published_at: "2024-03-01T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "g2",
        feed_id: "feed-a",
        title: "T2",
        url: "https://a.test/2",
        summary: null,
        author: null,
        published_at: "2024-03-02T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
    ]);
    expect(inserted1).toBe(2);

    const inserted2 = await insertArticles(env.DB, [
      {
        guid: "g1",
        feed_id: "feed-a",
        title: "T1 changed",
        url: "https://a.test/1",
        summary: "s1",
        author: null,
        published_at: "2024-03-01T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "g3",
        feed_id: "feed-b",
        title: "T3",
        url: "https://b.test/3",
        summary: null,
        author: null,
        published_at: "2024-03-03T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);
    expect(inserted2).toBe(1);
  });

  it("lists articles in published_at desc order with cursor pagination", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      guid: `g${i}`,
      feed_id: "feed-a",
      title: `T${i}`,
      url: `https://a.test/${i}`,
      summary: null,
      author: null,
      published_at: `2024-04-0${i + 1}T00:00:00.000Z`,
      category: "bigtech" as const,
      lang: "en" as const,
    }));
    await insertArticles(env.DB, rows);

    const page1 = await listArticles(env.DB, { limit: 2, cursor: null });
    expect(page1.articles.map((a) => a.guid)).toEqual(["g4", "g3"]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listArticles(env.DB, { limit: 2, cursor: page1.nextCursor });
    expect(page2.articles.map((a) => a.guid)).toEqual(["g2", "g1"]);
  });

  it("filters by category and feed_id", async () => {
    await insertArticles(env.DB, [
      {
        guid: "ga",
        feed_id: "feed-a",
        title: "A",
        url: "https://a.test/x",
        summary: null,
        author: null,
        published_at: "2024-04-01T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "gb",
        feed_id: "feed-b",
        title: "B",
        url: "https://b.test/x",
        summary: null,
        author: null,
        published_at: "2024-04-02T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);

    const onlyAi = await listArticles(env.DB, { limit: 10, category: "ai" });
    expect(onlyAi.articles.map((a) => a.guid)).toEqual(["gb"]);

    const onlyFeedA = await listArticles(env.DB, { limit: 10, feedId: "feed-a" });
    expect(onlyFeedA.articles.map((a) => a.guid)).toEqual(["ga"]);
  });
});
