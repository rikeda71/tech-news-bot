import { describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:test";
import { finishRun, getRun, listRuns, recordRunFeed, startRun } from "../../../worker/db/runs";

describe("runs db", () => {
  it("startRun returns a run_id", async () => {
    const { run_id } = await startRun(env.DB, "2024-04-01T00:00:00.000Z", 5);
    // 型と値の正当性は独立した観点
    expect.soft(typeof run_id).toBe("number");
    expect.soft(run_id).toBeGreaterThan(0);
  });

  it("listRuns returns empty array when no runs exist", async () => {
    const runs = await listRuns(env.DB);
    expect(runs).toHaveLength(0);
  });

  it("startRun → finishRun → listRuns round-trip", async () => {
    const startedAt = "2024-04-01T00:00:00.000Z";
    const completedAt = "2024-04-01T00:00:10.000Z";

    const { run_id } = await startRun(env.DB, startedAt, 10);
    await finishRun(env.DB, run_id, completedAt, 8, 2, 42);

    const runs = await listRuns(env.DB);
    expect(runs).toHaveLength(1);
    expect.soft(runs[0].id).toBe(run_id);
    expect.soft(runs[0].started_at).toBe(startedAt);
    expect.soft(runs[0].completed_at).toBe(completedAt);
    expect.soft(runs[0].feeds_total).toBe(10);
    expect.soft(runs[0].feeds_ok).toBe(8);
    expect.soft(runs[0].feeds_failed).toBe(2);
    expect.soft(runs[0].articles_inserted).toBe(42);
    expect.soft(runs[0].error).toBeNull();
  });

  it("startRun → recordRunFeed → getRun round-trip", async () => {
    const startedAt = "2024-04-02T00:00:00.000Z";
    const completedAt = "2024-04-02T00:00:15.000Z";

    const { run_id } = await startRun(env.DB, startedAt, 3);
    await recordRunFeed(env.DB, run_id, "feed-a", "ok", 5, 1200);
    await recordRunFeed(env.DB, run_id, "feed-b", "failed", 0, 500, "HTTP 503 error");
    await recordRunFeed(env.DB, run_id, "feed-c", "skipped", 0, 300);
    await finishRun(env.DB, run_id, completedAt, 2, 1, 5);

    const detail = await getRun(env.DB, run_id);
    expect(detail).not.toBeNull();
    expect.soft(detail!.run.id).toBe(run_id);
    expect(detail!.feeds).toHaveLength(3);

    const feedA = detail!.feeds.find((f) => f.feed_id === "feed-a");
    expect(feedA).not.toBeUndefined();
    expect.soft(feedA!.status).toBe("ok");
    expect.soft(feedA!.articles_inserted).toBe(5);
    expect.soft(feedA!.duration_ms).toBe(1200);
    expect.soft(feedA!.error).toBeNull();

    const feedB = detail!.feeds.find((f) => f.feed_id === "feed-b");
    expect(feedB).not.toBeUndefined();
    expect.soft(feedB!.status).toBe("failed");
    expect.soft(feedB!.error).toBe("HTTP 503 error");
  });

  it("getRun returns null for unknown id", async () => {
    const detail = await getRun(env.DB, 99999);
    expect(detail).toBeNull();
  });

  it("listRuns respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await startRun(env.DB, `2024-04-0${i + 1}T00:00:00.000Z`, 1);
    }
    const runs = await listRuns(env.DB, 3);
    expect(runs).toHaveLength(3);
  });

  it("listRuns orders by started_at desc", async () => {
    await startRun(env.DB, "2024-04-01T00:00:00.000Z", 1);
    await startRun(env.DB, "2024-04-03T00:00:00.000Z", 1);
    await startRun(env.DB, "2024-04-02T00:00:00.000Z", 1);

    const runs = await listRuns(env.DB);
    expect.soft(runs[0].started_at).toBe("2024-04-03T00:00:00.000Z");
    expect.soft(runs[1].started_at).toBe("2024-04-02T00:00:00.000Z");
    expect.soft(runs[2].started_at).toBe("2024-04-01T00:00:00.000Z");
  });

  it("error field is truncated to 200 characters", async () => {
    const { run_id } = await startRun(env.DB, "2024-04-10T00:00:00.000Z", 1);
    const longError = "E".repeat(300);
    await recordRunFeed(env.DB, run_id, "feed-x", "failed", 0, 100, longError);

    const detail = await getRun(env.DB, run_id);
    expect(detail!.feeds[0].error).toHaveLength(200);
  });

  it("CASCADE DELETE removes run feeds when run is deleted", async () => {
    const { run_id } = await startRun(env.DB, "2024-04-11T00:00:00.000Z", 1);
    await recordRunFeed(env.DB, run_id, "feed-y", "ok", 1, 100);

    await env.DB.prepare("DELETE FROM collector_runs WHERE id = ?1").bind(run_id).run();

    const result = await env.DB.prepare(
      "SELECT COUNT(*) AS cnt FROM collector_run_feeds WHERE run_id = ?1",
    )
      .bind(run_id)
      .first<{ cnt: number }>();
    expect(result!.cnt).toBe(0);
  });
});
