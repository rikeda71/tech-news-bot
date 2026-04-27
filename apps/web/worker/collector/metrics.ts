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
