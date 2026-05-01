import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:test";
import { insertArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import {
  getCategoriesSummary,
  getFeedHealth,
  getFeedsDiagnostics,
  getRecentArticlesByFeed,
} from "../../../worker/db/feed-stats";
import type { FeedConfig } from "../../../worker/types";

const FEED_BIGTECH: FeedConfig = {
  id: "fs-bigtech",
  name: "BigTech Feed",
  url: "https://bigtech.test/rss",
  category: "bigtech",
  lang: "en",
  enabled: true,
};

const FEED_AI: FeedConfig = {
  id: "fs-ai",
  name: "AI Feed",
  url: "https://ai.test/rss",
  category: "ai",
  lang: "en",
  enabled: true,
};

const FEED_JP: FeedConfig = {
  id: "fs-jp",
  name: "JP Feed",
  url: "https://jp.test/rss",
  category: "jp",
  lang: "ja",
  enabled: true,
};

const FEED_PERSONAL: FeedConfig = {
  id: "fs-personal",
  name: "Personal Feed",
  url: "https://personal.test/rss",
  category: "personal",
  lang: "ja",
  enabled: true,
};

// 30 日以内の記事を生成するヘルパー
function recentAt(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// getCategoriesSummary
// ---------------------------------------------------------------------------

describe("getCategoriesSummary", () => {
  it("returns all 4 categories with zeros when no feeds exist", async () => {
    const result = await getCategoriesSummary(env.DB);
    expect(result).toHaveLength(4);
    for (const cat of result) {
      expect.soft(cat.feeds_count).toBe(0);
      expect.soft(cat.articles_30d).toBe(0);
      expect.soft(cat.last_published_at).toBeNull();
    }
  });

  it("returns correct feeds_count per category", async () => {
    await syncFeeds(env.DB, [FEED_BIGTECH, FEED_AI]);
    const result = await getCategoriesSummary(env.DB);
    const bigtech = result.find((c) => c.id === "bigtech");
    const ai = result.find((c) => c.id === "ai");
    const jp = result.find((c) => c.id === "jp");
    expect(bigtech).toBeDefined();
    expect(ai).toBeDefined();
    expect.soft(bigtech?.feeds_count).toBe(1);
    expect.soft(ai?.feeds_count).toBe(1);
    expect.soft(jp?.feeds_count).toBe(0);
  });

  it("counts only articles within 30-day window in articles_30d", async () => {
    // 時刻を固定して 30-day 計算を安定させる
    vi.setSystemTime(new Date("2026-04-29T00:00:00Z"));
    await syncFeeds(env.DB, [FEED_BIGTECH]);
    await insertArticles(env.DB, [
      {
        guid: "fs-recent-1",
        feed_id: FEED_BIGTECH.id,
        title: "Recent Article",
        url: "https://bigtech.test/recent-1",
        summary: null,
        author: null,
        published_at: recentAt(5), // 5日前 → 30d 以内
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "fs-old-1",
        feed_id: FEED_BIGTECH.id,
        title: "Old Article",
        url: "https://bigtech.test/old-1",
        summary: null,
        author: null,
        published_at: recentAt(45), // 45日前 → 30d ウィンドウ外
        category: "bigtech",
        lang: "en",
      },
    ]);

    const result = await getCategoriesSummary(env.DB);
    const bigtech = result.find((c) => c.id === "bigtech");
    expect(bigtech).toBeDefined();
    expect.soft(bigtech?.articles_30d).toBe(1);
  });

  it("returns the correct label for each category", async () => {
    const result = await getCategoriesSummary(env.DB);
    const labels = Object.fromEntries(result.map((c) => [c.id, c.label]));
    expect.soft(labels["bigtech"]).toBe("ビッグテック");
    expect.soft(labels["ai"]).toBe("AI");
    expect.soft(labels["jp"]).toBe("日本企業");
    expect.soft(labels["personal"]).toBe("個人ブログ");
  });

  it("sets last_published_at to the most recent article's published_at", async () => {
    vi.setSystemTime(new Date("2026-04-29T00:00:00Z"));
    await syncFeeds(env.DB, [FEED_BIGTECH]);
    const newer = recentAt(1);
    const older = recentAt(10);
    await insertArticles(env.DB, [
      {
        guid: "fs-newer",
        feed_id: FEED_BIGTECH.id,
        title: "Newer",
        url: "https://bigtech.test/newer",
        summary: null,
        author: null,
        published_at: newer,
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "fs-older",
        feed_id: FEED_BIGTECH.id,
        title: "Older",
        url: "https://bigtech.test/older",
        summary: null,
        author: null,
        published_at: older,
        category: "bigtech",
        lang: "en",
      },
    ]);

    const result = await getCategoriesSummary(env.DB);
    const bigtech = result.find((c) => c.id === "bigtech");
    expect(bigtech).toBeDefined();
    expect(bigtech?.last_published_at).toBe(newer);
  });

  afterEach(() => vi.useRealTimers());
});

// ---------------------------------------------------------------------------
// getFeedsDiagnostics
// ---------------------------------------------------------------------------

describe("getFeedsDiagnostics", () => {
  it("returns empty array when no feeds exist", async () => {
    const result = await getFeedsDiagnostics(env.DB);
    expect(result).toHaveLength(0);
  });

  it("returns diagnostics for all feeds ordered by id", async () => {
    await syncFeeds(env.DB, [FEED_AI, FEED_BIGTECH]); // ai が id 辞書順で先
    const result = await getFeedsDiagnostics(env.DB);
    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe("fs-ai");
    expect(result[1]?.id).toBe("fs-bigtech");
  });

  it("maps enabled integer to boolean", async () => {
    await syncFeeds(env.DB, [FEED_BIGTECH]);
    const result = await getFeedsDiagnostics(env.DB);
    expect(result[0]).toBeDefined();
    expect.soft(result[0]?.enabled).toBe(true);
    expect.soft(typeof result[0]?.enabled).toBe("boolean");
  });

  it("includes disabled feeds as well", async () => {
    // FEED_BIGTECH は enabled→disabled に変更
    await syncFeeds(env.DB, [FEED_BIGTECH, FEED_AI]);
    await syncFeeds(env.DB, [FEED_AI]); // FEED_BIGTECH が orphan → disabled
    const result = await getFeedsDiagnostics(env.DB);
    expect(result).toHaveLength(2);
    const bigtech = result.find((r) => r.id === FEED_BIGTECH.id);
    expect(bigtech?.enabled).toBe(false);
  });

  it("counts articles_total and articles_30d correctly", async () => {
    vi.setSystemTime(new Date("2026-04-29T00:00:00Z"));
    await syncFeeds(env.DB, [FEED_BIGTECH]);
    await insertArticles(env.DB, [
      {
        guid: "fs-diag-recent",
        feed_id: FEED_BIGTECH.id,
        title: "Recent",
        url: "https://bigtech.test/diag-recent",
        summary: null,
        author: null,
        published_at: recentAt(5),
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "fs-diag-old",
        feed_id: FEED_BIGTECH.id,
        title: "Old",
        url: "https://bigtech.test/diag-old",
        summary: null,
        author: null,
        published_at: recentAt(60),
        category: "bigtech",
        lang: "en",
      },
    ]);

    const result = await getFeedsDiagnostics(env.DB);
    const bigtech = result.find((r) => r.id === FEED_BIGTECH.id);
    expect(bigtech).toBeDefined();
    expect.soft(bigtech?.articles_total).toBe(2);
    expect.soft(bigtech?.articles_30d).toBe(1);
  });

  afterEach(() => vi.useRealTimers());
});

// ---------------------------------------------------------------------------
// getRecentArticlesByFeed
// ---------------------------------------------------------------------------

describe("getRecentArticlesByFeed", () => {
  beforeEach(async () => {
    await syncFeeds(env.DB, [FEED_BIGTECH]);
  });

  it("returns empty array when no articles exist for the feed", async () => {
    const result = await getRecentArticlesByFeed(env.DB, FEED_BIGTECH.id, 10);
    expect(result).toHaveLength(0);
  });

  it("returns articles ordered by published_at descending", async () => {
    const older = recentAt(5);
    const newer = recentAt(1);
    await insertArticles(env.DB, [
      {
        guid: "fs-rab-older",
        feed_id: FEED_BIGTECH.id,
        title: "Older",
        url: "https://bigtech.test/rab-older",
        summary: null,
        author: null,
        published_at: older,
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "fs-rab-newer",
        feed_id: FEED_BIGTECH.id,
        title: "Newer",
        url: "https://bigtech.test/rab-newer",
        summary: null,
        author: null,
        published_at: newer,
        category: "bigtech",
        lang: "en",
      },
    ]);

    const result = await getRecentArticlesByFeed(env.DB, FEED_BIGTECH.id, 10);
    expect(result).toHaveLength(2);
    expect(result[0]?.published_at).toBe(newer);
    expect(result[1]?.published_at).toBe(older);
  });

  it("respects the limit parameter", async () => {
    await insertArticles(env.DB, [
      {
        guid: "fs-rab-lim-1",
        feed_id: FEED_BIGTECH.id,
        title: "A1",
        url: "https://bigtech.test/rab-lim-1",
        summary: null,
        author: null,
        published_at: recentAt(3),
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "fs-rab-lim-2",
        feed_id: FEED_BIGTECH.id,
        title: "A2",
        url: "https://bigtech.test/rab-lim-2",
        summary: null,
        author: null,
        published_at: recentAt(2),
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "fs-rab-lim-3",
        feed_id: FEED_BIGTECH.id,
        title: "A3",
        url: "https://bigtech.test/rab-lim-3",
        summary: null,
        author: null,
        published_at: recentAt(1),
        category: "bigtech",
        lang: "en",
      },
    ]);

    const result = await getRecentArticlesByFeed(env.DB, FEED_BIGTECH.id, 2);
    expect(result).toHaveLength(2);
  });

  it("returns only articles belonging to the specified feed", async () => {
    await syncFeeds(env.DB, [FEED_BIGTECH, FEED_AI]);
    await insertArticles(env.DB, [
      {
        guid: "fs-rab-bt",
        feed_id: FEED_BIGTECH.id,
        title: "BigTech Article",
        url: "https://bigtech.test/rab-bt",
        summary: null,
        author: null,
        published_at: recentAt(1),
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "fs-rab-ai",
        feed_id: FEED_AI.id,
        title: "AI Article",
        url: "https://ai.test/rab-ai",
        summary: null,
        author: null,
        published_at: recentAt(1),
        category: "ai",
        lang: "en",
      },
    ]);

    const result = await getRecentArticlesByFeed(env.DB, FEED_BIGTECH.id, 10);
    expect(result).toHaveLength(1);
    expect(result[0]?.feed_id).toBe(FEED_BIGTECH.id);
  });
});

// ---------------------------------------------------------------------------
// getFeedHealth
// ---------------------------------------------------------------------------

describe("getFeedHealth", () => {
  it("returns empty array when feeds config is empty", async () => {
    const result = await getFeedHealth(env.DB, []);
    expect(result).toHaveLength(0);
  });

  it("returns one entry per FeedConfig with defaults when no DB row exists", async () => {
    // DB に何も seed しなくても FeedConfig から結果が返る
    const result = await getFeedHealth(env.DB, [FEED_BIGTECH, FEED_AI]);
    expect(result).toHaveLength(2);
    const bigtech = result.find((r) => r.feed_id === FEED_BIGTECH.id);
    expect(bigtech).toBeDefined();
    expect.soft(bigtech?.last_success_at).toBeNull();
    expect.soft(bigtech?.last_failure_at).toBeNull();
    expect.soft(bigtech?.consecutive_failures).toBe(0);
    expect.soft(bigtech?.articles_last_7d).toBe(0);
  });

  it("maps feed_id and feed_name from FeedConfig", async () => {
    const result = await getFeedHealth(env.DB, [FEED_JP]);
    expect(result[0]).toBeDefined();
    expect.soft(result[0]?.feed_id).toBe(FEED_JP.id);
    expect.soft(result[0]?.feed_name).toBe(FEED_JP.name);
    expect.soft(result[0]?.enabled).toBe(FEED_JP.enabled);
  });

  it("reflects consecutive_failures from DB", async () => {
    await syncFeeds(env.DB, [FEED_BIGTECH]);
    await env.DB.prepare("UPDATE feeds SET consecutive_failures = 3 WHERE id = ?")
      .bind(FEED_BIGTECH.id)
      .run();

    const result = await getFeedHealth(env.DB, [FEED_BIGTECH]);
    const bigtech = result.find((r) => r.feed_id === FEED_BIGTECH.id);
    expect(bigtech?.consecutive_failures).toBe(3);
  });

  it("counts only articles published within 7 days in articles_last_7d", async () => {
    vi.setSystemTime(new Date("2026-04-29T00:00:00Z"));
    await syncFeeds(env.DB, [FEED_BIGTECH]);
    await insertArticles(env.DB, [
      {
        guid: "fs-fh-7d",
        feed_id: FEED_BIGTECH.id,
        title: "Within 7d",
        url: "https://bigtech.test/fh-7d",
        summary: null,
        author: null,
        published_at: recentAt(3),
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "fs-fh-old",
        feed_id: FEED_BIGTECH.id,
        title: "Old",
        url: "https://bigtech.test/fh-old",
        summary: null,
        author: null,
        published_at: recentAt(10),
        category: "bigtech",
        lang: "en",
      },
    ]);

    const result = await getFeedHealth(env.DB, [FEED_BIGTECH]);
    const bigtech = result.find((r) => r.feed_id === FEED_BIGTECH.id);
    expect(bigtech?.articles_last_7d).toBe(1);
  });

  it("returns all provided feeds even when some have no DB records", async () => {
    await syncFeeds(env.DB, [FEED_BIGTECH]); // FEED_AI は seed しない
    const result = await getFeedHealth(env.DB, [FEED_BIGTECH, FEED_AI, FEED_PERSONAL]);
    expect(result).toHaveLength(3);
    const ids = result.map((r) => r.feed_id);
    expect.soft(ids).toContain(FEED_BIGTECH.id);
    expect.soft(ids).toContain(FEED_AI.id);
    expect.soft(ids).toContain(FEED_PERSONAL.id);
  });

  afterEach(() => vi.useRealTimers());
});
