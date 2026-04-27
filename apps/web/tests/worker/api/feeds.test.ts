import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import { finishRun, recordRunFeed, startRun } from "../../../worker/db/runs";
import type { Article, FeedConfig } from "../../../worker/types";

const FEEDS: FeedConfig[] = [
  {
    id: "openai-blog",
    name: "OpenAI News",
    url: "https://x.test/openai",
    category: "ai",
    lang: "en",
    enabled: true,
  },
  {
    id: "google-research",
    name: "Google Research",
    url: "https://x.test/google",
    category: "bigtech",
    lang: "en",
    enabled: true,
  },
  {
    id: "zenn-ai",
    name: "Zenn AI",
    url: "https://zenn.dev/topics/ai/feed",
    category: "zenn",
    lang: "ja",
    enabled: false,
  },
  {
    id: "cyberagent-blog",
    name: "CyberAgent Tech Blog",
    url: "https://x.test/ca",
    category: "jp",
    lang: "ja",
    enabled: true,
  },
];

// 今日を基準に日付を計算するヘルパ
function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(async () => {
  await syncFeeds(env.DB, FEEDS);

  await insertArticles(env.DB, [
    // openai-blog: 30d 以内に 2 件、30d 超に 1 件
    {
      guid: "openai-1",
      feed_id: "openai-blog",
      title: "OpenAI Article 1",
      url: "https://x.test/openai/1",
      summary: null,
      author: null,
      published_at: daysAgo(5),
      category: "ai",
      lang: "en",
    },
    {
      guid: "openai-2",
      feed_id: "openai-blog",
      title: "OpenAI Article 2",
      url: "https://x.test/openai/2",
      summary: null,
      author: null,
      published_at: daysAgo(20),
      category: "ai",
      lang: "en",
    },
    {
      guid: "openai-3",
      feed_id: "openai-blog",
      title: "OpenAI Article 3 (old)",
      url: "https://x.test/openai/3",
      summary: null,
      author: null,
      // 30d 窓外: articles_30d に含まれないが last_published_at には影響しない
      published_at: daysAgo(31),
      category: "ai",
      lang: "en",
    },
    // google-research: 30d 以内に 1 件
    {
      guid: "google-1",
      feed_id: "google-research",
      title: "Google Research Article",
      url: "https://x.test/google/1",
      summary: null,
      author: null,
      published_at: daysAgo(10),
      category: "bigtech",
      lang: "en",
    },
    // cyberagent-blog: 記事なし (articles_30d=0, last_published_at=null を確認)
    // zenn-ai: 記事なし
  ]);
});

describe("GET /api/feeds - basic", () => {
  it("returns feeds array with articles_30d and last_published_at fields", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      feeds: {
        id: string;
        articles_30d: number;
        last_published_at: string | null;
        enabled: boolean;
      }[];
    };
    expect(Array.isArray(body.feeds)).toBe(true);
    const openai = body.feeds.find((f) => f.id === "openai-blog");
    expect(openai).toBeDefined();
    expect(openai!.articles_30d).toBe(2);
    expect(openai!.last_published_at).not.toBeNull();
    expect(openai!.enabled).toBe(true);
  });

  it("articles_30d counts only articles within 30 days", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds");
    const body = (await res.json()) as { feeds: { id: string; articles_30d: number }[] };
    const openai = body.feeds.find((f) => f.id === "openai-blog");
    // 30d 以内: openai-1 (5d前), openai-2 (20d前) = 2件。openai-3 (31d前) は除外
    expect(openai!.articles_30d).toBe(2);
  });

  it("last_published_at is the overall MAX published_at (not limited to 30d)", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds");
    const body = (await res.json()) as {
      feeds: { id: string; last_published_at: string | null }[];
    };
    const openai = body.feeds.find((f) => f.id === "openai-blog");
    // MAX は 5d 前の記事 (openai-1) = articles_30d window 内の最新
    // 31d 前の記事 (openai-3) が最古なので last_published_at は openai-1 の日付
    expect(openai!.last_published_at).not.toBeNull();
    const lastPub = new Date(openai!.last_published_at!);
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    // 5d 前の記事が最新なので last_published_at は今から 5 日以内
    expect(lastPub.getTime()).toBeGreaterThan(fiveDaysAgo.getTime() - 60_000);
  });

  it("feed with 0 articles has articles_30d=0 and last_published_at=null", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds");
    const body = (await res.json()) as {
      feeds: { id: string; articles_30d: number; last_published_at: string | null }[];
    };
    const ca = body.feeds.find((f) => f.id === "cyberagent-blog");
    expect(ca).toBeDefined();
    expect(ca!.articles_30d).toBe(0);
    expect(ca!.last_published_at).toBeNull();
  });

  it("returns feeds sorted by id ASC", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds");
    const body = (await res.json()) as { feeds: { id: string }[] };
    const ids = body.feeds.map((f) => f.id);
    expect(ids).toEqual(ids.toSorted());
  });
});

describe("GET /api/feeds - filter by category", () => {
  it("returns only ai feeds when category=ai", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds?category=ai");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { feeds: { id: string; category: string }[] };
    expect(body.feeds.every((f) => f.category === "ai")).toBe(true);
    expect(body.feeds.some((f) => f.id === "openai-blog")).toBe(true);
    expect(body.feeds.some((f) => f.id === "google-research")).toBe(false);
  });

  it("returns 400 for invalid category value", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds?category=invalid");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/feeds - filter by lang", () => {
  it("returns only ja feeds when lang=ja", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds?lang=ja");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { feeds: { id: string; lang: string }[] };
    expect(body.feeds.every((f) => f.lang === "ja")).toBe(true);
    expect(body.feeds.some((f) => f.id === "openai-blog")).toBe(false);
  });

  it("returns 400 for invalid lang value", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds?lang=zh");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/feeds - filter by enabled", () => {
  it("returns only disabled feeds when enabled=false", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds?enabled=false");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { feeds: { id: string; enabled: boolean }[] };
    expect(body.feeds.every((f) => !f.enabled)).toBe(true);
    expect(body.feeds.some((f) => f.id === "zenn-ai")).toBe(true);
    expect(body.feeds.some((f) => f.id === "openai-blog")).toBe(false);
  });

  it("returns only enabled feeds when enabled=true", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds?enabled=true");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { feeds: { id: string; enabled: boolean }[] };
    expect(body.feeds.every((f) => f.enabled)).toBe(true);
    expect(body.feeds.some((f) => f.id === "zenn-ai")).toBe(false);
  });

  it("returns 400 for invalid enabled value", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds?enabled=yes");
    expect(res.status).toBe(400);
  });
});

describe("GET /api/feeds/:id", () => {
  // 11 件挿入して default 10 件上限のテストに使う
  beforeEach(async () => {
    await insertArticles(
      env.DB,
      Array.from({ length: 9 }, (_, i) => ({
        guid: `openai-extra-${i + 1}`,
        feed_id: "openai-blog",
        title: `OpenAI Extra ${i + 1}`,
        url: `https://x.test/openai/extra-${i + 1}`,
        summary: null,
        author: null,
        // openai-1 (daysAgo(5)), openai-2 (daysAgo(20)) は beforeEach で投入済み
        // extra は daysAgo(1) 〜 daysAgo(9) を追加して合計 11 件にする
        published_at: daysAgo(i + 1),
        category: "ai" as const,
        lang: "en" as const,
      })),
    );
  });

  it("returns 404 for unknown id", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/no-such-feed");
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("feed not found");
  });

  it("returns 200 with feed and recent_articles structure", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog");
    expect(res.status).toBe(200);
    const body = await res.json<{ feed: unknown; recent_articles: unknown[] }>();
    expect(body.feed).toBeDefined();
    expect(Array.isArray(body.recent_articles)).toBe(true);
  });

  it("returns correct feed fields", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog");
    const body = await res.json<{
      feed: {
        id: string;
        name: string;
        url: string;
        category: string;
        lang: string;
        enabled: boolean;
        articles_30d: number;
        last_published_at: string | null;
      };
      recent_articles: unknown[];
    }>();
    expect(body.feed.id).toBe("openai-blog");
    expect(body.feed.name).toBe("OpenAI News");
    expect(body.feed.category).toBe("ai");
    expect(body.feed.lang).toBe("en");
    expect(body.feed.enabled).toBe(true);
    // openai-1 (5d), openai-2 (20d), extra 1-9 (1-9d) = 11件、openai-3 (31d) は窓外
    expect(body.feed.articles_30d).toBe(11);
    expect(body.feed.last_published_at).not.toBeNull();
  });

  it("returns default 10 recent_articles when recent is not specified", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog");
    const body = await res.json<{ feed: unknown; recent_articles: Article[] }>();
    // 11 件あるが default は 10 件
    expect(body.recent_articles.length).toBe(10);
  });

  it("returns recent_articles sorted by published_at descending", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog");
    const body = await res.json<{ feed: unknown; recent_articles: Article[] }>();
    const dates = body.recent_articles.map((a) => a.published_at);
    for (let i = 0; i < dates.length - 1; i++) {
      expect(dates[i] >= dates[i + 1]).toBe(true);
    }
  });

  it("returns empty recent_articles when recent=0", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog?recent=0");
    expect(res.status).toBe(200);
    const body = await res.json<{ feed: unknown; recent_articles: Article[] }>();
    expect(body.recent_articles).toEqual([]);
  });

  it("returns 400 when recent=51", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog?recent=51");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toContain("recent must be an integer");
  });

  it("returns specified number of recent_articles when recent=3", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog?recent=3");
    expect(res.status).toBe(200);
    const body = await res.json<{ feed: unknown; recent_articles: Article[] }>();
    expect(body.recent_articles.length).toBe(3);
  });

  it("returns 0 articles_30d and null last_published_at for feed with no articles", async () => {
    // google-research には 30d 以内の記事が 1 件 (beforeEach で投入済み)
    // 新しいフィードで確認するため zenn-ai を使う
    const res = await SELF.fetch("https://example.com/api/feeds/zenn-ai");
    expect(res.status).toBe(200);
    const body = await res.json<{
      feed: { articles_30d: number; last_published_at: string | null };
      recent_articles: Article[];
    }>();
    expect(body.feed.articles_30d).toBe(0);
    expect(body.feed.last_published_at).toBeNull();
    expect(body.recent_articles).toEqual([]);
  });

  it("sets Cache-Control: public, max-age=300", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });

  it("returns Content-Type application/json", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog");
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});

describe("GET /api/feeds/:id/health", () => {
  // collector_runs + collector_run_feeds を挿入するヘルパ
  async function insertRun(
    feedId: string,
    status: "ok" | "failed" | "skipped",
    opts: {
      daysAgoN?: number;
      durationMs?: number;
      articlesInserted?: number;
      error?: string;
    } = {},
  ) {
    const { daysAgoN = 0, durationMs = 200, articlesInserted = 3, error } = opts;
    const startedAt = new Date(Date.now() - daysAgoN * 24 * 60 * 60 * 1000).toISOString();
    const { run_id } = await startRun(env.DB, startedAt, 1);
    await recordRunFeed(env.DB, run_id, feedId, status, articlesInserted, durationMs, error);
    await finishRun(
      env.DB,
      run_id,
      new Date(new Date(startedAt).getTime() + durationMs).toISOString(),
      status === "ok" ? 1 : 0,
      status === "failed" ? 1 : 0,
      articlesInserted,
      error,
    );
    return run_id;
  }

  beforeEach(async () => {
    // 3 成功 + 1 失敗 を openai-blog に挿入
    await insertRun("openai-blog", "ok", { daysAgoN: 1, durationMs: 300, articlesInserted: 5 });
    await insertRun("openai-blog", "ok", { daysAgoN: 2, durationMs: 200, articlesInserted: 3 });
    await insertRun("openai-blog", "ok", { daysAgoN: 3, durationMs: 400, articlesInserted: 10 });
    await insertRun("openai-blog", "failed", {
      daysAgoN: 4,
      durationMs: 100,
      articlesInserted: 0,
      error: "Fetch error: timeout",
    });
  });

  it("returns 404 for feed not in feeds.yaml", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/no-such-feed/health");
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("feed not found");
  });

  it("returns 400 for invalid days param", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog/health?days=abc");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("invalid days");
  });

  it("returns 400 when days exceeds 30", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog/health?days=31");
    expect(res.status).toBe(400);
  });

  it("returns 400 when days=0", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog/health?days=0");
    expect(res.status).toBe(400);
  });

  it("returns 200 with correct structure and counts", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog/health?days=7");
    expect(res.status).toBe(200);
    const body = await res.json<{
      feed_id: string;
      window_days: number;
      total_runs: number;
      successful_runs: number;
      failed_runs: number;
      success_rate: number | null;
      last_run_at: string | null;
      last_run_status: string | null;
      last_error: { at: string; message: string | null } | null;
      avg_duration_ms: number | null;
      articles_inserted_total: number;
    }>();
    expect(body.feed_id).toBe("openai-blog");
    expect(body.window_days).toBe(7);
    expect(body.total_runs).toBe(4);
    expect(body.successful_runs).toBe(3);
    expect(body.failed_runs).toBe(1);
    expect(body.success_rate).toBeCloseTo(0.75, 2);
    expect(body.last_run_at).not.toBeNull();
    // 最終実行は ok (1日前)
    expect(body.last_run_status).toBe("success");
    // 失敗が存在するので last_error は非 null
    expect(body.last_error).not.toBeNull();
    expect(body.last_error!.message).toContain("timeout");
    expect(body.avg_duration_ms).not.toBeNull();
    // 合計記事数: 5+3+10+0=18
    expect(body.articles_inserted_total).toBe(18);
  });

  it("returns null last_error when no failures", async () => {
    // google-research にはランを挿入していないため 0 件
    // 成功のみのランを別フィードに挿入して確認
    await insertRun("google-research", "ok", { daysAgoN: 1, durationMs: 150, articlesInserted: 2 });
    const res = await SELF.fetch("https://example.com/api/feeds/google-research/health");
    expect(res.status).toBe(200);
    const body = await res.json<{ last_error: null; last_run_status: string }>();
    expect(body.last_error).toBeNull();
    expect(body.last_run_status).toBe("success");
  });

  it("returns total_runs=0 when no runs in window", async () => {
    // cyberagent-developers には run なし
    const res = await SELF.fetch(
      "https://example.com/api/feeds/cyberagent-developers/health?days=7",
    );
    expect(res.status).toBe(200);
    const body = await res.json<{
      total_runs: number;
      success_rate: number | null;
      last_run_at: string | null;
    }>();
    expect(body.total_runs).toBe(0);
    expect(body.success_rate).toBeNull();
    expect(body.last_run_at).toBeNull();
  });

  it("uses default days=7 when days param is omitted", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog/health");
    expect(res.status).toBe(200);
    const body = await res.json<{ window_days: number }>();
    expect(body.window_days).toBe(7);
  });

  it("sets Cache-Control: public, max-age=300", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog/health");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });
});
