import type { Env } from "../types";

export interface CollectorEvent {
  feedId: string;
  status: "ok" | "error" | "not_modified";
  ms: number;
  statusCode: number;
}

export function writeCollectorEvent(env: Env, ev: CollectorEvent): void {
  if (!env.COLLECTOR_AE) return;
  try {
    env.COLLECTOR_AE.writeDataPoint({
      blobs: [ev.feedId, ev.status],
      doubles: [ev.ms, ev.statusCode],
      indexes: [ev.feedId],
    });
  } catch (e) {
    console.warn("[collector] AE writeDataPoint failed", e);
  }
}

/** collector 1 run 分の D1 アクセスコスト集計 */
export interface D1RunStats {
  rowsRead: number;
  rowsWritten: number;
  durationTotalMs: number;
}

/** D1 クエリの meta からコスト統計を累積するカウンター */
export class D1CostAccumulator {
  rowsRead = 0;
  rowsWritten = 0;
  durationTotalMs = 0;

  /** D1Result.meta オブジェクトを受け取り統計に加算する */
  add(
    meta: { rows_read?: number; rows_written?: number; duration?: number } | null | undefined,
  ): void {
    if (!meta) return;
    this.rowsRead += meta.rows_read ?? 0;
    this.rowsWritten += meta.rows_written ?? 0;
    this.durationTotalMs += meta.duration ?? 0;
  }

  toStats(): D1RunStats {
    return {
      rowsRead: this.rowsRead,
      rowsWritten: this.rowsWritten,
      durationTotalMs: this.durationTotalMs,
    };
  }
}

export interface D1CostEvent {
  rowsRead: number;
  rowsWritten: number;
  durationTotalMs: number;
  feedsCount: number;
  articlesInserted: number;
}

/**
 * collector 1 run 分の D1 コスト集計値を AE に送信する。
 * 送信失敗は best-effort でログのみ (collector を止めない)。
 */
export function writeD1CostEvent(env: Env, ev: D1CostEvent): void {
  // 構造化ログ (1 run 1 行)
  console.log(
    JSON.stringify({
      event: "collect_run_d1",
      rows_read: ev.rowsRead,
      rows_written: ev.rowsWritten,
      duration_total_ms: ev.durationTotalMs,
      feeds_count: ev.feedsCount,
      articles_inserted: ev.articlesInserted,
    }),
  );

  if (!env.COLLECTOR_AE) return;
  try {
    env.COLLECTOR_AE.writeDataPoint({
      blobs: ["collect_run_d1"],
      doubles: [ev.rowsRead, ev.rowsWritten, ev.durationTotalMs, ev.articlesInserted],
      indexes: ["d1_cost"],
    });
  } catch (e) {
    console.warn("[collector] AE writeDataPoint (d1_cost) failed", e);
  }
}
