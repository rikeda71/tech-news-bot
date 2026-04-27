export interface RunRow {
  id: number;
  started_at: string;
  completed_at: string | null;
  feeds_total: number | null;
  feeds_ok: number | null;
  feeds_failed: number | null;
  articles_inserted: number | null;
  error: string | null;
}

export interface RunFeedRow {
  run_id: number;
  feed_id: string;
  status: "ok" | "failed" | "skipped";
  articles_inserted: number;
  duration_ms: number;
  error: string | null;
}

export async function startRun(
  db: D1Database,
  started_at: string,
  feeds_total: number,
): Promise<{ run_id: number }> {
  const result = await db
    .prepare(
      `INSERT INTO collector_runs (started_at, feeds_total)
       VALUES (?1, ?2)`,
    )
    .bind(started_at, feeds_total)
    .run();
  const run_id = result.meta.last_row_id as number;
  return { run_id };
}

export async function recordRunFeed(
  db: D1Database,
  run_id: number,
  feed_id: string,
  status: "ok" | "failed" | "skipped",
  articles_inserted: number,
  duration_ms: number,
  error?: string,
): Promise<void> {
  // 200 文字で切り詰め。長いスタックトレースを D1 に書かないため。
  const errorTruncated = error ? error.slice(0, 200) : null;
  await db
    .prepare(
      `INSERT INTO collector_run_feeds (run_id, feed_id, status, articles_inserted, duration_ms, error)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
    )
    .bind(run_id, feed_id, status, articles_inserted, duration_ms, errorTruncated)
    .run();
}

export async function finishRun(
  db: D1Database,
  run_id: number,
  completed_at: string,
  feeds_ok: number,
  feeds_failed: number,
  articles_inserted: number,
  error?: string,
): Promise<void> {
  const errorTruncated = error ? error.slice(0, 200) : null;
  await db
    .prepare(
      `UPDATE collector_runs
       SET completed_at = ?1,
           feeds_ok = ?2,
           feeds_failed = ?3,
           articles_inserted = ?4,
           error = ?5
       WHERE id = ?6`,
    )
    .bind(completed_at, feeds_ok, feeds_failed, articles_inserted, errorTruncated, run_id)
    .run();
}

export async function listRuns(db: D1Database, limit = 20): Promise<RunRow[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const result = await db
    .prepare(
      `SELECT id, started_at, completed_at, feeds_total, feeds_ok, feeds_failed,
              articles_inserted, error
       FROM collector_runs
       ORDER BY started_at DESC
       LIMIT ?1`,
    )
    .bind(safeLimit)
    .all<RunRow>();
  return result.results ?? [];
}

export async function getRun(
  db: D1Database,
  run_id: number,
): Promise<{ run: RunRow; feeds: RunFeedRow[] } | null> {
  const run = await db
    .prepare(
      `SELECT id, started_at, completed_at, feeds_total, feeds_ok, feeds_failed,
              articles_inserted, error
       FROM collector_runs
       WHERE id = ?1`,
    )
    .bind(run_id)
    .first<RunRow>();
  if (!run) return null;

  const feedsResult = await db
    .prepare(
      `SELECT run_id, feed_id, status, articles_inserted, duration_ms, error
       FROM collector_run_feeds
       WHERE run_id = ?1
       ORDER BY feed_id ASC`,
    )
    .bind(run_id)
    .all<RunFeedRow>();

  return { run, feeds: feedsResult.results ?? [] };
}
