import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Stats } from "../../client/hooks/useStats";

const { useStats } = await import("../../client/hooks/useStats");

function makeStats(overrides: Partial<Stats> = {}): Stats {
  return {
    total: 100,
    last_published_at: "2026-04-28T12:00:00Z",
    last_fetched_at: "2026-04-28T13:00:00Z",
    last24h: 5,
    by_category: { ai: 50, bigtech: 30, jp: 15, zenn: 5 },
    by_lang: { en: 70, ja: 30 },
    stale_feeds: [],
    category_trend_30d: [],
    feed_activity: [],
    ...overrides,
  };
}

function makeResponse(stats: Stats) {
  return {
    ok: true,
    json: () => Promise.resolve(stats),
  };
}

describe("useStats", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetch 成功時に stats が返される", async () => {
    const stats = makeStats({ total: 42 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(stats)));

    const { result } = renderHook(() => useStats());

    await waitFor(() => {
      expect(result.current.stats).not.toBeNull();
    });

    expect(result.current.stats?.total).toBe(42);
    expect(result.current.error).toBeNull();
  });

  it("fetch エラー時に error が設定される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    const { result } = renderHook(() => useStats());

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.stats).toBeNull();
    expect(result.current.error).toContain("503");
  });

  it("ネットワーク例外発生時に error が設定される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network timeout")));

    const { result } = renderHook(() => useStats());

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
    });

    expect(result.current.error).toBe("Network timeout");
    expect(result.current.stats).toBeNull();
  });

  it("refreshSignal が変わると再 fetch が発火する", async () => {
    const stats = makeStats();
    const mockFetch = vi.fn().mockResolvedValue(makeResponse(stats));
    vi.stubGlobal("fetch", mockFetch);

    const { result, rerender } = renderHook(({ signal }) => useStats(signal), {
      initialProps: { signal: 0 },
    });

    await waitFor(() => {
      expect(result.current.stats).not.toBeNull();
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    rerender({ signal: 1 });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  it("stats の by_category が正しく反映される", async () => {
    const stats = makeStats({ by_category: { ai: 99, bigtech: 1 } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(stats)));

    const { result } = renderHook(() => useStats());

    await waitFor(() => {
      expect(result.current.stats).not.toBeNull();
    });

    expect(result.current.stats?.by_category["ai"]).toBe(99);
    expect(result.current.stats?.by_category["bigtech"]).toBe(1);
  });
});
