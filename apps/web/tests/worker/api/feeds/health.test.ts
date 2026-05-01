import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { syncFeeds } from "../../../../worker/db/feeds";
import { finishRun, recordRunFeed, startRun } from "../../../../worker/db/runs";
import type { FeedConfig } from "../../../../worker/types";

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
    id: "google-developers",
    name: "Google Research",
    url: "https://x.test/google",
    category: "bigtech",
    lang: "en",
    enabled: true,
  },
  {
    id: "zenn-mizchi",
    name: "Zenn AI",
    url: "https://zenn.dev/mizchi/feed",
    category: "personal",
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

beforeEach(async () => {
  await syncFeeds(env.DB, FEEDS);
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
    const body = await res.json<{ error: string }>();
    expect.soft(res.status).toBe(404);
    expect.soft(body.error).toBe("feed not found");
  });

  it("returns 400 for invalid days param", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog/health?days=abc");
    const body = await res.json<{ error: string }>();
    expect.soft(res.status).toBe(400);
    expect.soft(body.error).toBe("invalid days");
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
    expect.soft(res.status).toBe(200);
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
    expect.soft(body.feed_id).toBe("openai-blog");
    expect.soft(body.window_days).toBe(7);
    expect.soft(body.total_runs).toBe(4);
    expect.soft(body.successful_runs).toBe(3);
    expect.soft(body.failed_runs).toBe(1);
    expect.soft(body.success_rate).toBeCloseTo(0.75, 2);
    expect.soft(body.last_run_at).not.toBeNull();
    // 最終実行は ok (1日前)
    expect.soft(body.last_run_status).toBe("success");
    // 失敗が存在するので last_error は非 null
    expect(body.last_error).not.toBeNull();
    expect.soft(body.last_error!.message).toContain("timeout");
    expect.soft(body.avg_duration_ms).not.toBeNull();
    // 合計記事数: 5+3+10+0=18
    expect.soft(body.articles_inserted_total).toBe(18);
  });

  it("returns null last_error when no failures", async () => {
    // google-developers にはランを挿入していないため 0 件
    // 成功のみのランを別フィードに挿入して確認
    await insertRun("google-developers", "ok", {
      daysAgoN: 1,
      durationMs: 150,
      articlesInserted: 2,
    });
    const res = await SELF.fetch("https://example.com/api/feeds/google-developers/health");
    const body = await res.json<{ last_error: null; last_run_status: string }>();
    expect.soft(res.status).toBe(200);
    expect.soft(body.last_error).toBeNull();
    expect.soft(body.last_run_status).toBe("success");
  });

  it("returns total_runs=0 when no runs in window", async () => {
    // cyberagent-developers には run なし
    const res = await SELF.fetch(
      "https://example.com/api/feeds/cyberagent-developers/health?days=7",
    );
    const body = await res.json<{
      total_runs: number;
      success_rate: number | null;
      last_run_at: string | null;
    }>();
    expect.soft(res.status).toBe(200);
    expect.soft(body.total_runs).toBe(0);
    expect.soft(body.success_rate).toBeNull();
    expect.soft(body.last_run_at).toBeNull();
  });

  it("uses default days=7 when days param is omitted", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog/health");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ window_days: number }>();
    expect.soft(body.window_days).toBe(7);
  });

  it("sets Cache-Control with max-age=300 and stale-while-revalidate", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds/openai-blog/health");
    expect.soft(res.headers.get("Cache-Control")).toContain("max-age=300");
    expect.soft(res.headers.get("Cache-Control")).toContain("stale-while-revalidate");
  });
});
