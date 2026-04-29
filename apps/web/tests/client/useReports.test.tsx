import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ReportDetail, ReportKind, ReportListItem } from "../../client/types/api";

const { useReportsList, useReport } = await import("../../client/hooks/useReports");

function makeReportListItem(id: number): ReportListItem {
  return {
    id,
    kind: "daily",
    period_start: "2026-04-28",
    period_end: "2026-04-28",
    category: "ai",
    lang: "ja",
    source_skill: "tech-news-digest",
    generated_at: "2026-04-28T23:00:00Z",
  };
}

function makeReportDetail(id: number): ReportDetail {
  return {
    ...makeReportListItem(id),
    content: "# Daily Report\nContent here.",
    meta_json: null,
  };
}

describe("useReportsList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetch 成功時にレポート一覧が返される", async () => {
    const reports = [makeReportListItem(1), makeReportListItem(2)];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ reports }),
      }),
    );

    const { result } = renderHook(() => useReportsList());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toHaveLength(2);
    expect(result.current.data[0]?.id).toBe(1);
    expect(result.current.error).toBeNull();
  });

  it("fetch エラー時に error が設定されデータは空", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { result } = renderHook(() => useReportsList());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain("500");
    expect(result.current.data).toEqual([]);
  });

  it("空のレポート一覧が返された場合、data は空配列", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ reports: [] }),
      }),
    );

    const { result } = renderHook(() => useReportsList());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("kind が変わると再 fetch が発火する", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ reports: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { rerender } = renderHook(({ kind }: { kind: ReportKind }) => useReportsList(kind), {
      initialProps: { kind: "daily" },
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    rerender({ kind: "weekly" });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe("useReport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetch 成功時にレポート詳細が返される", async () => {
    const report = makeReportDetail(5);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ report }),
      }),
    );

    const { result } = renderHook(() => useReport(5));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data?.id).toBe(5);
    expect(result.current.data?.content).toBe("# Daily Report\nContent here.");
    expect(result.current.error).toBeNull();
  });

  it("fetch エラー時に error が設定される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const { result } = renderHook(() => useReport(99));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain("404");
    expect(result.current.data).toBeNull();
  });

  it("id が変わると再 fetch が発火する", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ report: makeReportDetail(1) }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { rerender } = renderHook(({ id }) => useReport(id), {
      initialProps: { id: 1 },
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    rerender({ id: 2 });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  it("ネットワーク例外発生時に error が設定される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Connection refused")));

    const { result } = renderHook(() => useReport(1));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Connection refused");
    expect(result.current.data).toBeNull();
  });
});
