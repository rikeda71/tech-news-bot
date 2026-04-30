import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ReportListItem } from "../../client/types/api";

function makeReport(id: number, kind: "daily" | "weekly" | "monthly" = "daily"): ReportListItem {
  return {
    id,
    kind,
    period_start: "2026-04-28T00:00:00.000Z",
    period_end: "2026-04-29T00:00:00.000Z",
    category: null,
    lang: null,
    source_skill: "tech-news-digest",
    generated_at: "2026-04-29T00:01:00.000Z",
  };
}

function makeListResponse(reports: ReportListItem[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ reports }),
  };
}

const { ReportsList } = await import("../../client/components/ReportsList");

describe("ReportsList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loading 中に '読み込み中...' が表示される", async () => {
    // resolve しない fetch で loading 状態を保持する
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    render(<ReportsList onSelectReport={() => {}} />);
    expect(screen.getByText("読み込み中...")).toBeTruthy();
  });

  it("レポートが返されたとき一覧が表示される", async () => {
    const reports = [makeReport(1, "daily"), makeReport(2, "weekly")];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeListResponse(reports)));

    render(<ReportsList onSelectReport={() => {}} />);

    await waitFor(() => {
      expect(screen.queryByText("読み込み中...")).toBeNull();
    });

    // 日次・週次ラベルが表示される
    expect.soft(screen.getAllByText("日次").length).toBeGreaterThanOrEqual(1);
    expect.soft(screen.getAllByText("週次").length).toBeGreaterThanOrEqual(1);
  });

  it("レポートが 0 件のとき '...ありません' が表示される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeListResponse([])));

    render(<ReportsList onSelectReport={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("レポートがまだありません")).toBeTruthy();
    });
  });

  it("レポート行クリックで onSelectReport が呼ばれる", async () => {
    const reports = [makeReport(42, "daily")];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeListResponse(reports)));

    const onSelectReport = vi.fn<(id: number) => void>();
    render(<ReportsList onSelectReport={onSelectReport} />);

    await waitFor(() => {
      expect(screen.queryByText("読み込み中...")).toBeNull();
    });

    // 期間テキストが含まれるボタンをクリック
    const buttons = screen.getAllByRole("button");
    // chip ボタン (all/daily/weekly/monthly) の後にリストアイテムボタンが来る
    const reportButton = buttons.find((b) => b.textContent?.includes("2026"));
    expect(reportButton).toBeTruthy();
    if (reportButton) {
      await userEvent.click(reportButton);
      expect(onSelectReport).toHaveBeenCalledWith(42);
    }
  });

  it("kind フィルタ chip は選択状態を aria-pressed で表す", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeListResponse([])));

    const user = userEvent.setup();
    render(<ReportsList onSelectReport={() => {}} />);

    await waitFor(() => {
      expect(screen.queryByText("読み込み中...")).toBeNull();
    });

    // 初期状態: 「すべて」が選択中
    const allButton = screen.getByRole("button", { name: "すべて" });
    expect(allButton.getAttribute("aria-pressed")).toBe("true");

    // 「日次」クリック後: aria-pressed が切り替わる
    await user.click(screen.getByRole("button", { name: "日次" }));
    expect.soft(screen.getByRole("button", { name: "日次" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect.soft(screen.getByRole("button", { name: "すべて" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("kind フィルタ chip をクリックすると fetch URL が変わる", async () => {
    const mockFetch = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(makeListResponse([]) as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const user = userEvent.setup();
    render(<ReportsList onSelectReport={() => {}} />);

    await waitFor(() => {
      expect(screen.queryByText("読み込み中...")).toBeNull();
    });

    // 初回 fetch URL を確認
    const calls = mockFetch.mock.calls as unknown as Array<[string]>;
    expect(calls[0]?.[0]).not.toContain("kind=");

    // 週次 chip をクリック
    await user.click(screen.getByRole("button", { name: "週次" }));

    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    expect((mockFetch.mock.calls as unknown as Array<[string]>)[1]?.[0]).toContain("kind=weekly");
  });
});
