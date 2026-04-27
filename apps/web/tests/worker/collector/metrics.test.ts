import { describe, expect, it, vi } from "vite-plus/test";
import { writeCollectorEvent } from "../../../worker/collector/metrics";
import type { Env } from "../../../worker/types";

function makeEnv(writeDataPoint?: ReturnType<typeof vi.fn>): Env {
  const ae = writeDataPoint ? { writeDataPoint } : undefined;
  return {
    DB: {} as unknown as D1Database,
    ASSETS: {} as unknown as Fetcher,
    COLLECTOR_CONCURRENCY: "4",
    COLLECTOR_TIMEOUT_MS: "10000",
    COLLECTOR_RETRIES: "2",
    SUMMARY_MAX_LENGTH: "500",
    RETENTION_DAYS: "90",
    CORS_ALLOWED_ORIGINS: "*",
    COLLECTOR_AE: ae as unknown as AnalyticsEngineDataset | undefined,
  };
}

describe("writeCollectorEvent", () => {
  it("calls writeDataPoint with correct blobs/doubles/indexes on ok status", () => {
    const writeDataPoint = vi.fn<() => void>();
    const env = makeEnv(writeDataPoint);

    writeCollectorEvent(env, { feedId: "feed-a", status: "ok", ms: 123, statusCode: 200 });

    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(writeDataPoint).toHaveBeenCalledWith({
      blobs: ["feed-a", "ok"],
      doubles: [123, 200],
      indexes: ["feed-a"],
    });
  });

  it("calls writeDataPoint with correct blobs/doubles/indexes on error status", () => {
    const writeDataPoint = vi.fn<() => void>();
    const env = makeEnv(writeDataPoint);

    writeCollectorEvent(env, { feedId: "feed-b", status: "error", ms: 456, statusCode: 503 });

    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(writeDataPoint).toHaveBeenCalledWith({
      blobs: ["feed-b", "error"],
      doubles: [456, 503],
      indexes: ["feed-b"],
    });
  });

  it("calls writeDataPoint with correct blobs/doubles/indexes on not_modified status", () => {
    const writeDataPoint = vi.fn<() => void>();
    const env = makeEnv(writeDataPoint);

    writeCollectorEvent(env, {
      feedId: "feed-c",
      status: "not_modified",
      ms: 50,
      statusCode: 304,
    });

    expect(writeDataPoint).toHaveBeenCalledTimes(1);
    expect(writeDataPoint).toHaveBeenCalledWith({
      blobs: ["feed-c", "not_modified"],
      doubles: [50, 304],
      indexes: ["feed-c"],
    });
  });

  it("does not throw when COLLECTOR_AE binding is undefined", () => {
    const env = makeEnv(undefined);

    expect(() => {
      writeCollectorEvent(env, { feedId: "feed-d", status: "ok", ms: 10, statusCode: 200 });
    }).not.toThrow();
  });

  it("does not throw when writeDataPoint throws internally", () => {
    const writeDataPoint = vi.fn<() => void>().mockImplementation(() => {
      throw new Error("AE unavailable");
    });
    const env = makeEnv(writeDataPoint);

    expect(() => {
      writeCollectorEvent(env, { feedId: "feed-e", status: "error", ms: 99, statusCode: 0 });
    }).not.toThrow();
  });
});
