import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { CalendarHeatmap } from "../../client/components/CalendarHeatmap";

// テスト用: 今日から N 日前までのカレンダーデータを生成する
function makeCalendarDays(count: number, baseCount = 3) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - (count - 1 - i));
    return { date: d.toISOString().slice(0, 10), count: baseCount };
  });
}

function mockFetch(items: ReturnType<typeof makeCalendarDays>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ days: items.length, items }),
    }),
  );
}

function mockFetchError() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }),
  );
}

describe("CalendarHeatmap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ローディング状態を表示する", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<CalendarHeatmap days={90} />);
    expect(screen.getByText(/読み込み中/)).toBeTruthy();
  });

  it("エラー時にエラーメッセージを表示する", async () => {
    mockFetchError();
    render(<CalendarHeatmap days={90} />);
    const err = await screen.findByText(/ヒートマップを取得できませんでした/);
    expect(err).toBeTruthy();
  });

  it("90日分のデータからセルが render される", async () => {
    const days = makeCalendarDays(90);
    mockFetch(days);
    const { container } = render(<CalendarHeatmap days={90} />);
    // セルが描画されるまで待つ
    await screen.findByText("活動カレンダー");
    const cells = container.querySelectorAll("[data-level]");
    // 90セル分 (range内) + 凡例の5セル = 95以上
    expect(cells.length).toBeGreaterThanOrEqual(90);
  });

  it("各セルに data-level 属性が付与される (count=3 → level=2)", async () => {
    const days = makeCalendarDays(90, 3);
    mockFetch(days);
    const { container } = render(<CalendarHeatmap days={90} />);
    await screen.findByText("活動カレンダー");
    // count=3 → level=2 のセルが存在する
    const level2Cells = container.querySelectorAll('[data-level="2"]');
    expect(level2Cells.length).toBeGreaterThan(0);
  });

  it("aria-label に日付と件数が含まれる", async () => {
    const days = makeCalendarDays(90, 5);
    mockFetch(days);
    const { container } = render(<CalendarHeatmap days={90} />);
    await screen.findByText("活動カレンダー");
    // aria-label="M月D日: 5件" の形式のセルが存在する
    const cells = container.querySelectorAll("[data-level][aria-label]");
    expect(cells.length).toBeGreaterThan(0);
    const labels = Array.from(cells).map((c) => c.getAttribute("aria-label") ?? "");
    expect.soft(labels.some((l) => l.includes("5件"))).toBe(true);
    expect.soft(labels.some((l) => l.includes("月") && l.includes("日"))).toBe(true);
  });

  it("count=0 のセルは data-level=0 が付与される", async () => {
    const days = makeCalendarDays(90, 0);
    mockFetch(days);
    const { container } = render(<CalendarHeatmap days={90} />);
    await screen.findByText("活動カレンダー");
    const level0Cells = container.querySelectorAll('[data-level="0"]');
    // 90セル (range内) + 凡例1セル
    expect(level0Cells.length).toBeGreaterThanOrEqual(90);
  });

  it("count=11以上のセルは data-level=4 が付与される", async () => {
    const days = makeCalendarDays(90, 15);
    mockFetch(days);
    const { container } = render(<CalendarHeatmap days={90} />);
    await screen.findByText("活動カレンダー");
    const level4Cells = container.querySelectorAll('[data-level="4"]');
    // 90セル (range内) + 凡例1セル
    expect(level4Cells.length).toBeGreaterThanOrEqual(90);
  });

  it("30日切替ボタンをクリックすると fetch URL が変わる", async () => {
    const days90 = makeCalendarDays(90);
    const days30 = makeCalendarDays(30);
    // fetch 呼び出し先 URL を記録するため手動 mock を使う
    const calledUrls: string[] = [];
    let callCount = 0;
    vi.stubGlobal("fetch", (url: string) => {
      calledUrls.push(url);
      callCount++;
      const data = callCount === 1 ? days90 : days30;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ days: data.length, items: data }),
      });
    });

    render(<CalendarHeatmap days={90} />);
    await screen.findByText("活動カレンダー");

    const btn30 = screen.getByRole("button", { name: "30日" });
    fireEvent.click(btn30);

    // 2回目の fetch が ?days=30 で呼ばれることを確認
    await vi.waitFor(() => {
      expect(calledUrls.length).toBe(2);
    });
    expect(calledUrls[1]).toContain("days=30");
  });

  it("365日切替ボタンをクリックすると fetch URL が変わる", async () => {
    const days90 = makeCalendarDays(90);
    const days365 = makeCalendarDays(365);
    const calledUrls: string[] = [];
    let callCount = 0;
    vi.stubGlobal("fetch", (url: string) => {
      calledUrls.push(url);
      callCount++;
      const data = callCount === 1 ? days90 : days365;
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ days: data.length, items: data }),
      });
    });

    render(<CalendarHeatmap days={90} />);
    await screen.findByText("活動カレンダー");

    const btn365 = screen.getByRole("button", { name: "365日" });
    fireEvent.click(btn365);

    await vi.waitFor(() => {
      expect(calledUrls.length).toBe(2);
    });
    expect(calledUrls[1]).toContain("days=365");
  });

  it("活動カレンダーの見出しが表示される", async () => {
    mockFetch(makeCalendarDays(90));
    render(<CalendarHeatmap days={90} />);
    await screen.findByText("活動カレンダー");
  });
});
