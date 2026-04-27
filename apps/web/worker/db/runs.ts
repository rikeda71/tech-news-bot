import type {
  CollectorRunDbRow,
  CollectorRunFeedDbRow,
  CronHealthDbRow,
  FeedFailureDbRow,
  FeedHealthRunDbRow,
} from "./types";

/** collector_runs の公開型エイリアス */
export type RunRow = CollectorRunDbRow;

/** collector_run_feeds の公開型エイリアス */
export type RunFeedRow = CollectorRunFeedDbRow;

/** getFeedHealth (runs) の公開型エイリアス */
export type FeedHealthRow = FeedHealthRunDbRow;

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

export async function getLatestCompletedRun(db: D1Database): Promise<RunRow | null> {
  const row = await db
    .prepare(
      `SELECT id, started_at, completed_at, feeds_total, feeds_ok, feeds_failed,
              articles_inserted, error
       FROM collector_runs
       WHERE completed_at IS NOT NULL
       ORDER BY completed_at DESC
       LIMIT 1`,
    )
    .first<RunRow>();
  return row ?? null;
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

// collector_runs を集計して運用メトリクスを返す。1 クエリで完結させ D1 CPU を節約する。
export async function getCronHealth(
  db: D1Database,
  days: 7 | 30,
): Promise<{
  window_days: number;
  runs_total: number;
  runs_succeeded: number;
  runs_failed: number;
  avg_run_ms: number | null;
  articles_collected: number;
}> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS runs_total,
         SUM(CASE WHEN completed_at IS NOT NULL AND (error IS NULL OR error = '') THEN 1 ELSE 0 END) AS runs_succeeded,
         SUM(CASE WHEN error IS NOT NULL AND error != '' THEN 1 ELSE 0 END) AS runs_failed,
         AVG(
           CASE
             WHEN completed_at IS NOT NULL
             THEN CAST((julianday(completed_at) - julianday(started_at)) * 86400000 AS INTEGER)
           END
         ) AS avg_run_ms,
         SUM(COALESCE(articles_inserted, 0)) AS articles_collected
       FROM collector_runs
       WHERE started_at >= ?1`,
    )
    .bind(since)
    .first<CronHealthDbRow>();

  return {
    window_days: days,
    runs_total: row?.runs_total ?? 0,
    runs_succeeded: row?.runs_succeeded ?? 0,
    runs_failed: row?.runs_failed ?? 0,
    avg_run_ms: row?.avg_run_ms ?? null,
    articles_collected: row?.articles_collected ?? 0,
  };
}

// 指定期間内で失敗の多いフィードを返す。failures 降順、successes 昇順で上位 N 件を返す。
export async function getFeedFailures(
  db: D1Database,
  days: 7 | 30,
  limit: number,
): Promise<FeedFailureDbRow[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const result = await db
    .prepare(
      `SELECT
         crf.feed_id,
         SUM(CASE WHEN crf.status = 'failed' THEN 1 ELSE 0 END) AS failures,
         SUM(CASE WHEN crf.status = 'ok' THEN 1 ELSE 0 END) AS successes,
         MAX(CASE WHEN crf.status = 'failed' THEN crf.error END) AS last_error,
         MAX(cr.started_at) AS last_attempted_at
       FROM collector_run_feeds crf
       JOIN collector_runs cr ON cr.id = crf.run_id
       WHERE cr.started_at >= ?1
       GROUP BY crf.feed_id
       HAVING failures > 0
       ORDER BY failures DESC, successes ASC
       LIMIT ?2`,
    )
    .bind(since, safeLimit)
    .all<FeedFailureDbRow>();
  return result.results ?? [];
}

/**
 * 指定フィードの直近 N 日間の健全性集計を 1 クエリで返す。
 * collector_run_feeds と collector_runs を JOIN し SUM/COUNT/AVG/MAX で集計する。
 */
export async function getFeedHealth(
  db: D1Database,
  feedId: string,
  days: number,
): Promise<FeedHealthRow> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const row = await db
    .prepare(
      `SELECT
         COUNT(*) AS total_runs,
         SUM(CASE WHEN crf.status = 'ok' THEN 1 ELSE 0 END) AS successful_runs,
         SUM(CASE WHEN crf.status = 'failed' THEN 1 ELSE 0 END) AS failed_runs,
         MAX(cr.started_at) AS last_run_at,
         MAX(CASE WHEN cr.started_at = (
           SELECT MAX(cr2.started_at)
           FROM collector_run_feeds crf2
           JOIN collector_runs cr2 ON cr2.id = crf2.run_id
           WHERE crf2.feed_id = ?1 AND cr2.started_at >= ?2
         ) THEN crf.status END) AS last_run_status,
         MAX(CASE WHEN crf.status = 'failed' THEN cr.started_at END) AS last_error_at,
         MAX(CASE WHEN crf.status = 'failed' THEN crf.error END) AS last_error_message,
         AVG(CASE WHEN crf.status != 'skipped' THEN crf.duration_ms END) AS avg_duration_ms,
         SUM(crf.articles_inserted) AS articles_inserted_total
       FROM collector_run_feeds crf
       JOIN collector_runs cr ON cr.id = crf.run_id
       WHERE crf.feed_id = ?1
         AND cr.started_at >= ?2`,
    )
    .bind(feedId, since)
    .first<FeedHealthRow>();

  return {
    total_runs: row?.total_runs ?? 0,
    successful_runs: row?.successful_runs ?? 0,
    failed_runs: row?.failed_runs ?? 0,
    last_run_at: row?.last_run_at ?? null,
    last_run_status: row?.last_run_status ?? null,
    last_error_at: row?.last_error_at ?? null,
    last_error_message: row?.last_error_message ?? null,
    avg_duration_ms: row?.avg_duration_ms ?? null,
    articles_inserted_total: row?.articles_inserted_total ?? 0,
  };
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
