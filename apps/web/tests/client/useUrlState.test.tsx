import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// useUrlState は useSyncExternalStore + window.location を使うため
// テスト間で window.location.search と内部キャッシュを隔離する
const { useUrlState, parseSearch } = await import("../../client/hooks/useUrlState");

describe("parseSearch", () => {
  it("parses q and category from search string", () => {
    const state = parseSearch("?q=react&category=ai");
    expect(state).toEqual({ q: "react", category: "ai", lang: "", bookmarksOnly: false });
  });

  it("returns empty defaults for empty search", () => {
    expect(parseSearch("")).toEqual({ q: "", category: "", lang: "", bookmarksOnly: false });
  });

  it("returns empty category for invalid value", () => {
    const state = parseSearch("?category=foo");
    expect(state.category).toBe("");
  });

  it("returns empty lang for invalid value", () => {
    const state = parseSearch("?lang=xx");
    expect(state.lang).toBe("");
  });

  it("sets bookmarksOnly true when bookmarks=only", () => {
    const state = parseSearch("?bookmarks=only");
    expect(state.bookmarksOnly).toBe(true);
  });

  it("sets bookmarksOnly false when bookmarks has other value", () => {
    const state = parseSearch("?bookmarks=1");
    expect(state.bookmarksOnly).toBe(false);
  });
});

describe("useUrlState", () => {
  beforeEach(() => {
    // window.location.search をリセットする
    window.history.replaceState(null, "", "/");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, "", "/");
  });

  it("初期 URL ?q=react&category=ai で hook が正しい state を返す", () => {
    window.history.replaceState(null, "", "/?q=react&category=ai");
    const { result } = renderHook(() => useUrlState());
    expect(result.current[0]).toEqual({
      q: "react",
      category: "ai",
      lang: "",
      bookmarksOnly: false,
    });
  });

  it("setFilters({ category: 'jp' }) で URL に category=jp が反映される", () => {
    window.history.replaceState(null, "", "/");
    const { result } = renderHook(() => useUrlState());

    act(() => {
      result.current[1]({ category: "jp" });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(window.location.search).toContain("category=jp");
    expect(result.current[0].category).toBe("jp");
  });

  it("setFilters({ category: '' }) で URL から category が消える", () => {
    window.history.replaceState(null, "", "/?category=ai");
    const { result } = renderHook(() => useUrlState());

    act(() => {
      result.current[1]({ category: "" });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(window.location.search).not.toContain("category");
    expect(result.current[0].category).toBe("");
  });

  it("bookmarksOnly: true で URL に bookmarks=only が付く", () => {
    window.history.replaceState(null, "", "/");
    const { result } = renderHook(() => useUrlState());

    act(() => {
      result.current[1]({ bookmarksOnly: true });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(window.location.search).toContain("bookmarks=only");
    expect(result.current[0].bookmarksOnly).toBe(true);
  });

  it("bookmarksOnly: false で URL から bookmarks が消える", () => {
    window.history.replaceState(null, "", "/?bookmarks=only");
    const { result } = renderHook(() => useUrlState());
    expect(result.current[0].bookmarksOnly).toBe(true);

    act(() => {
      result.current[1]({ bookmarksOnly: false });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(window.location.search).not.toContain("bookmarks");
    expect(result.current[0].bookmarksOnly).toBe(false);
  });

  it("popstate dispatch で state が更新される", () => {
    window.history.replaceState(null, "", "/");
    const { result } = renderHook(() => useUrlState());
    expect(result.current[0].category).toBe("");

    act(() => {
      window.history.replaceState(null, "", "/?category=zenn");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(result.current[0].category).toBe("zenn");
  });

  it("debounce: 連続 setFilters の URL 更新は 300ms 後の最後の値になる", () => {
    window.history.replaceState(null, "", "/");
    const { result } = renderHook(() => useUrlState());

    act(() => {
      result.current[1]({ q: "a" });
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // 100ms 経過後、まだ URL は更新されていない
    expect(window.location.search).not.toContain("q=");

    act(() => {
      result.current[1]({ q: "ab" });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // debounce が解消されて最後の値 "ab" が URL に反映される
    expect(window.location.search).toContain("q=ab");
    expect(result.current[0].q).toBe("ab");
  });

  it("不正な category 値は '' にフォールバックする", () => {
    window.history.replaceState(null, "", "/?category=invalid_value");
    const { result } = renderHook(() => useUrlState());
    expect(result.current[0].category).toBe("");
  });

  it("すべてデフォルト値の場合は URL に query string が付かない", () => {
    window.history.replaceState(null, "", "/");
    const { result } = renderHook(() => useUrlState());

    act(() => {
      result.current[1]({ q: "test" });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(window.location.search).toContain("q=test");

    act(() => {
      result.current[1]({ q: "" });
    });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    // すべてデフォルト → query string なし
    expect(window.location.search).toBe("");
  });
});
