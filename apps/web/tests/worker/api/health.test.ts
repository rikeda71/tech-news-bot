import { describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

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
