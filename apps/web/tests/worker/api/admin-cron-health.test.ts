import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { finishRun, recordRunFeed, startRun } from "../../../worker/db/runs";

const AUTH_HEADER = { authorization: "Bearer test-admin-token" };

// ダミー run を挿入するヘルパー
async function insertRun(
  startedAt: string,
  completedAt: string | null,
  articlesInserted: number,
  error?: string,
): Promise<number> {
  const { run_id } = await startRun(env.DB, startedAt, 2);
  if (completedAt !== null) {
    await finishRun(
      env.DB,
      run_id,
      completedAt,
      error ? 0 : 2,
      error ? 1 : 0,
      articlesInserted,
      error,
    );
  }
  return run_id;
}

// 7 日以内の日時文字列を生成する
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

beforeEach(async () => {
  // setup.ts の beforeEach で reset + applyD1Migrations が実行される
});

describe("GET /api/admin/cron-health", () => {
  it("401: token なし → 401", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/cron-health");
    expect(res.status).toBe(401);
  });

  it("401: 不正 token → 401", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/cron-health", {
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("400: days=99 → 400", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/cron-health?days=99", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/days must be 7 or 30/);
  });

  it("400: days=0 → 400", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/cron-health?days=0", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(400);
  });

  it("200: データなし → ゼロ値を返す", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/cron-health", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      window_days: number;
      runs_total: number;
      runs_succeeded: number;
      runs_failed: number;
      articles_collected: number;
      top_failing_feeds: unknown[];
    };
    expect.soft(body.window_days).toBe(7);
    expect.soft(body.runs_total).toBe(0);
    expect.soft(body.runs_succeeded).toBe(0);
    expect.soft(body.runs_failed).toBe(0);
    expect.soft(body.articles_collected).toBe(0);
    expect.soft(Array.isArray(body.top_failing_feeds)).toBe(true);
    expect.soft(body.top_failing_feeds).toHaveLength(0);
  });

  it("200: runs_total / runs_succeeded / runs_failed のカウントが正しい", async () => {
    // 成功 run × 2
    await insertRun(daysAgo(1), daysAgo(1), 5);
    await insertRun(daysAgo(2), daysAgo(2), 3);
    // 失敗 run × 1
    await insertRun(daysAgo(3), daysAgo(3), 0, "connection error");

    const res = await SELF.fetch("https://example.com/api/admin/cron-health?days=7", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      runs_total: number;
      runs_succeeded: number;
      runs_failed: number;
      articles_collected: number;
    };
    expect.soft(body.runs_total).toBe(3);
    expect.soft(body.runs_succeeded).toBe(2);
    expect.soft(body.runs_failed).toBe(1);
    expect.soft(body.articles_collected).toBe(8);
  });

  it("200: top_failing_feeds が failures 降順", async () => {
    const run1 = await insertRun(daysAgo(1), daysAgo(1), 0, "err");
    await recordRunFeed(env.DB, run1, "feed-a", "failed", 0, 100, "err");
    await recordRunFeed(env.DB, run1, "feed-b", "failed", 0, 100, "err");

    const run2 = await insertRun(daysAgo(2), daysAgo(2), 0, "err");
    await recordRunFeed(env.DB, run2, "feed-a", "failed", 0, 100, "err");

    const res = await SELF.fetch("https://example.com/api/admin/cron-health?days=7", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      top_failing_feeds: { feed_id: string; failures: number }[];
    };
    // feed-a (failures=2) が feed-b (failures=1) より先
    expect(body.top_failing_feeds.length).toBeGreaterThanOrEqual(2);
    expect.soft(body.top_failing_feeds[0].feed_id).toBe("feed-a");
    expect.soft(body.top_failing_feeds[0].failures).toBe(2);
    expect.soft(body.top_failing_feeds[1].feed_id).toBe("feed-b");
    expect.soft(body.top_failing_feeds[1].failures).toBe(1);
  });

  it("200: days=7 で古いデータは含まれない", async () => {
    // 8 日前のデータ (7 日ウィンドウには含まれないはず)
    await insertRun(daysAgo(8), daysAgo(8), 10);

    const res = await SELF.fetch("https://example.com/api/admin/cron-health?days=7", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs_total: number };
    expect(body.runs_total).toBe(0);
  });

  it("200: days=30 で 8 日前のデータが含まれる", async () => {
    // 8 日前のデータ (30 日ウィンドウには含まれる)
    await insertRun(daysAgo(8), daysAgo(8), 5);

    const res = await SELF.fetch("https://example.com/api/admin/cron-health?days=30", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { runs_total: number; window_days: number };
    expect.soft(body.window_days).toBe(30);
    expect.soft(body.runs_total).toBe(1);
  });

  it("200: Cache-Control ヘッダが private, max-age=60 を含む", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/cron-health", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(200);
    const cacheControl = res.headers.get("cache-control") ?? "";
    expect.soft(cacheControl).toContain("private");
    expect.soft(cacheControl).toContain("max-age=60");
  });
});
