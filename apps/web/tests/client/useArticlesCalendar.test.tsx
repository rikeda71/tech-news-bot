import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { CalendarDay } from "../../client/types/api";

const { useArticlesCalendar } = await import("../../client/hooks/useArticlesCalendar");

function makeCalendarDay(date: string, count: number): CalendarDay {
  return { date, count };
}

function makeResponse(items: CalendarDay[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ days: items.length, items }),
  };
}

describe("useArticlesCalendar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetch 成功時にカレンダーアイテムが返される", async () => {
    const items = [makeCalendarDay("2026-04-28", 5), makeCalendarDay("2026-04-27", 3)];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(items)));

    const { result } = renderHook(() => useArticlesCalendar(30));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect.soft(result.current.items).toHaveLength(2);
    expect.soft(result.current.items[0]?.date).toBe("2026-04-28");
    expect.soft(result.current.items[0]?.count).toBe(5);
    expect.soft(result.current.error).toBeNull();
  });

  it("fetch エラー時に error が設定されアイテムは空", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { result } = renderHook(() => useArticlesCalendar(30));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect.soft(result.current.error).toContain("500");
    expect.soft(result.current.items).toEqual([]);
  });

  it("空のレスポンスの場合 items が空配列", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ days: 90, items: [] }),
      }),
    );

    const { result } = renderHook(() => useArticlesCalendar(90));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect.soft(result.current.items).toEqual([]);
    expect.soft(result.current.error).toBeNull();
  });

  it("days が変わると再 fetch が発火する", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse([]));
    vi.stubGlobal("fetch", mockFetch);

    const { rerender } = renderHook(({ days }) => useArticlesCalendar(days), {
      initialProps: { days: 30 as 30 | 90 | 365 },
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const firstCall = mockFetch.mock.calls[0] as [string, ...unknown[]];
    expect(firstCall[0]).toContain("days=30");

    rerender({ days: 90 as 30 | 90 | 365 });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const secondCall = mockFetch.mock.calls[1] as [string, ...unknown[]];
    expect(secondCall[0]).toContain("days=90");
  });

  it("ネットワーク例外発生時に error が設定される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const { result } = renderHook(() => useArticlesCalendar(365));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect.soft(result.current.error).toBe("Network error");
    expect.soft(result.current.items).toEqual([]);
  });
});
