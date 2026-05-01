import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { useFilterHandlers } = await import("../../client/hooks/useFilterHandlers");

function makeState(overrides: Partial<Parameters<typeof useFilterHandlers>[0]> = {}) {
  return {
    category: "" as const,
    lang: "" as const,
    feedId: "",
    q: "",
    dateFrom: "",
    dateTo: "",
    unreadOnly: false,
    starredOnly: false,
    bookmarkedOnly: false,
    ...overrides,
  };
}

function makeSetters(overrides: Partial<Parameters<typeof useFilterHandlers>[1]> = {}) {
  return {
    setFeedId: vi.fn(),
    setDateFrom: vi.fn(),
    setDateTo: vi.fn(),
    setUnreadOnly: vi.fn(),
    setStarredOnly: vi.fn(),
    setUrlFilters: vi.fn(),
    setView: vi.fn(),
    ...overrides,
  };
}

describe("useFilterHandlers", () => {
  beforeEach(() => {
    // window.history.pushState と PopStateEvent のシミュレーション
    vi.stubGlobal(
      "history",
      Object.assign(Object.create(window.history), {
        pushState: vi.fn(),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("handleCategoryChange が category を変更し feedId を維持する (category 非空の場合)", () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useFilterHandlers(makeState({ feedId: "old-feed" }), setters),
    );

    act(() => {
      result.current.handleCategoryChange("ai");
    });

    // v が truthy なので feedId はそのまま維持される
    expect(setters.setFeedId).toHaveBeenCalledWith("old-feed");
  });

  it("handleCategoryChange が空文字に変更されたとき feedId をリセットする", () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useFilterHandlers(makeState({ category: "ai", feedId: "old-feed" }), setters),
    );

    act(() => {
      result.current.handleCategoryChange("");
    });

    // v が falsy なので feedId は空にリセットされる
    expect(setters.setFeedId).toHaveBeenCalledWith("");
  });

  it("handleLangChange が lang を変更し feedId を維持する (lang 非空の場合)", () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useFilterHandlers(makeState({ feedId: "some-feed" }), setters),
    );

    act(() => {
      result.current.handleLangChange("ja");
    });

    // v が truthy なので feedId はそのまま維持される
    expect(setters.setFeedId).toHaveBeenCalledWith("some-feed");
  });

  it("handleLangChange が空文字に変更されたとき feedId をリセットする", () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useFilterHandlers(makeState({ lang: "en", feedId: "some-feed" }), setters),
    );

    act(() => {
      result.current.handleLangChange("");
    });

    // v が falsy なので feedId は空にリセットされる
    expect(setters.setFeedId).toHaveBeenCalledWith("");
  });

  it("handleFeedChange が setFeedId に feedId を渡して呼ぶ", () => {
    const setters = makeSetters();
    const { result } = renderHook(() => useFilterHandlers(makeState(), setters));

    act(() => {
      result.current.handleFeedChange("new-feed-id");
    });

    expect(setters.setFeedId).toHaveBeenCalledWith("new-feed-id");
  });

  it("handleQChange が setUrlFilters を q 付きで呼ぶ", () => {
    const setters = makeSetters();
    const { result } = renderHook(() => useFilterHandlers(makeState(), setters));

    act(() => {
      result.current.handleQChange("react hooks");
    });

    expect(setters.setUrlFilters).toHaveBeenCalledWith({ q: "react hooks" });
  });

  it("handleDateFromChange が setDateFrom を新しい値で呼ぶ", () => {
    const setters = makeSetters();
    const { result } = renderHook(() => useFilterHandlers(makeState(), setters));

    act(() => {
      result.current.handleDateFromChange("2026-04-01");
    });

    expect(setters.setDateFrom).toHaveBeenCalledWith("2026-04-01");
  });

  it("handleDateToChange が setDateTo を新しい値で呼ぶ", () => {
    const setters = makeSetters();
    const { result } = renderHook(() => useFilterHandlers(makeState(), setters));

    act(() => {
      result.current.handleDateToChange("2026-04-30");
    });

    expect(setters.setDateTo).toHaveBeenCalledWith("2026-04-30");
  });

  it("handleUnreadOnlyChange が setUnreadOnly を新しい値で呼ぶ", () => {
    const setters = makeSetters();
    const { result } = renderHook(() => useFilterHandlers(makeState(), setters));

    act(() => {
      result.current.handleUnreadOnlyChange(true);
    });

    expect(setters.setUnreadOnly).toHaveBeenCalledWith(true);
  });

  it("handleStarredOnlyChange が setStarredOnly を新しい値で呼ぶ", () => {
    const setters = makeSetters();
    const { result } = renderHook(() => useFilterHandlers(makeState(), setters));

    act(() => {
      result.current.handleStarredOnlyChange(true);
    });

    expect(setters.setStarredOnly).toHaveBeenCalledWith(true);
  });

  it("handleClear が全フィルタを空にしてリセットする", () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useFilterHandlers(
        makeState({
          category: "ai",
          lang: "en",
          feedId: "some-feed",
          q: "query",
          dateFrom: "2026-01-01",
          dateTo: "2026-04-30",
          unreadOnly: true,
          starredOnly: true,
        }),
        setters,
      ),
    );

    act(() => {
      result.current.handleClear();
    });

    expect.soft(setters.setFeedId).toHaveBeenCalledWith("");
    expect.soft(setters.setDateFrom).toHaveBeenCalledWith("");
    expect.soft(setters.setDateTo).toHaveBeenCalledWith("");
    expect.soft(setters.setUnreadOnly).toHaveBeenCalledWith(false);
    expect.soft(setters.setStarredOnly).toHaveBeenCalledWith(false);
  });

  it("handleBookmarkedOnlyToggle が setUrlFilters で bookmarksOnly を反転させる", () => {
    const setters = makeSetters();
    const { result } = renderHook(() =>
      useFilterHandlers(makeState({ bookmarkedOnly: false }), setters),
    );

    act(() => {
      result.current.handleBookmarkedOnlyToggle();
    });

    expect(setters.setUrlFilters).toHaveBeenCalledWith({ bookmarksOnly: true });
  });

  it("handleSelectCategory が setView を呼ぶ", () => {
    const setters = makeSetters();
    const { result } = renderHook(() => useFilterHandlers(makeState(), setters));

    act(() => {
      result.current.handleSelectCategory("bigtech");
    });

    expect(setters.setView).toHaveBeenCalledWith("articles");
  });

  it("handleApplyPreset が指定したフィルタを適用する", () => {
    const setters = makeSetters();
    const { result } = renderHook(() => useFilterHandlers(makeState(), setters));

    act(() => {
      result.current.handleApplyPreset({
        category: "ai",
        lang: "ja",
        feedId: "preset-feed",
        q: "preset query",
        unreadOnly: true,
        starredOnly: false,
      });
    });

    expect.soft(setters.setFeedId).toHaveBeenCalledWith("preset-feed");
    expect.soft(setters.setUnreadOnly).toHaveBeenCalledWith(true);
    expect.soft(setters.setStarredOnly).toHaveBeenCalledWith(false);
  });
});
