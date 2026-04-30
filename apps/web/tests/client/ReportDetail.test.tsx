import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ReportDetail } from "../../client/types/api";

function makeDetail(overrides: Partial<ReportDetail> = {}): ReportDetail {
  return {
    id: 1,
    kind: "daily",
    period_start: "2026-04-28T00:00:00.000Z",
    period_end: "2026-04-29T00:00:00.000Z",
    category: null,
    lang: null,
    source_skill: "tech-news-digest",
    generated_at: "2026-04-29T00:01:00.000Z",
    content: "# Hello\n\nWorld content.",
    meta_json: null,
    ...overrides,
  };
}

function makeDetailResponse(report: ReportDetail) {
  return {
    ok: true,
    json: () => Promise.resolve({ report }),
  };
}

const { ReportDetail: ReportDetailComponent } =
  await import("../../client/components/ReportDetail");

describe("ReportDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loading 中に '読み込み中...' が表示される", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    render(<ReportDetailComponent id={1} onBack={() => {}} />);
    expect(screen.getByText("読み込み中...")).toBeTruthy();
  });

  it("markdown の # が h1 としてレンダリングされる", async () => {
    const detail = makeDetail({ content: "# Heading One\n\nSome text." });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeDetailResponse(detail)));

    render(<ReportDetailComponent id={1} onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.queryByText("読み込み中...")).toBeNull();
    });

    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent).toBe("Heading One");
  });

  it("onBack が '← 一覧に戻る' クリックで呼ばれる", async () => {
    const detail = makeDetail();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeDetailResponse(detail)));

    const onBack = vi.fn<() => void>();
    render(<ReportDetailComponent id={1} onBack={onBack} />);

    await waitFor(() => {
      expect(screen.queryByText("読み込み中...")).toBeNull();
    });

    await userEvent.click(screen.getByText("← 一覧に戻る"));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("meta_json に dedup_total があれば表示される", async () => {
    const detail = makeDetail({
      meta_json: JSON.stringify({
        dedup_total: 99,
        by_category: { bigtech: 50, ai: 49 },
      }),
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeDetailResponse(detail)));

    render(<ReportDetailComponent id={1} onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.queryByText("読み込み中...")).toBeNull();
    });

    expect(screen.getByText("99")).toBeTruthy();
  });

  it("エラー時に '← 一覧に戻る' が表示される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    render(<ReportDetailComponent id={999} onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.queryByText("読み込み中...")).toBeNull();
    });

    expect(screen.getByText("← 一覧に戻る")).toBeTruthy();
  });

  it("markdown 内の javascript: リンクが href='#' にサニタイズされる", async () => {
    const detail = makeDetail({
      content: "[危険リンク](javascript:alert(1))",
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeDetailResponse(detail)));

    const { container } = render(<ReportDetailComponent id={1} onBack={() => {}} />);

    await waitFor(() => {
      expect(screen.queryByText("読み込み中...")).toBeNull();
    });

    const link = container.querySelector("a[href]");
    expect(link?.getAttribute("href")).toBe("#");
  });
});
