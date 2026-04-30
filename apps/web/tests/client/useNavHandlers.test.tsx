import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { KbState, NavState } from "../../client/hooks/useNavHandlers";
import type { Article } from "../../client/types/api";

const { useNavHandlers } = await import("../../client/hooks/useNavHandlers");

function makeArticle(id: number): Article {
  return {
    id,
    guid: `guid-${id}`,
    feed_id: "feed-1",
    feed_name: "Test Feed",
    title: `Article ${id}`,
    url: `https://example.com/article/${id}`,
    summary: null,
    author: null,
    published_at: "2024-01-01T00:00:00Z",
    fetched_at: "2024-01-01T00:00:00Z",
    category: "ai",
    lang: "en",
  };
}

function makeNavState(overrides?: Partial<NavState>): NavState {
  return {
    setView: vi.fn<(view: string) => void>(),
    setFeedDetailId: vi.fn<(id: string) => void>(),
    setAuthorName: vi.fn<(name: string) => void>(),
    setReportId: vi.fn<(id: number) => void>(),
    setFeedId: vi.fn<(id: string) => void>(),
    setDateFrom: vi.fn<(date: string) => void>(),
    setDateTo: vi.fn<(date: string) => void>(),
    setUnreadOnly: vi.fn<(value: boolean) => void>(),
    setStarredOnly: vi.fn<(value: boolean) => void>(),
    ...overrides,
  };
}

function makeKbState(overrides?: Partial<KbState>): KbState {
  return {
    articles: [],
    selectedIndex: -1,
    helpOpen: false,
    setSelectedIndex: vi.fn<(updater: ((prev: number) => number) | number) => void>(),
    setHelpOpen: vi.fn<(open: boolean) => void>(),
    toggleBookmark: vi.fn<(guid: string) => void>(),
    searchRef: { current: null },
    ...overrides,
  };
}

describe("useNavHandlers", () => {
  afterEach(() => {
    vi.clearAllMocks();
    // history をルートに戻す
    window.history.pushState(null, "", "/");
  });

  // ---- nav handlers ----

  describe("handleViewChange", () => {
    it("stats に切り替えると setView('stats') と history push が起きる", () => {
      const nav = makeNavState();
      const { result } = renderHook(() => useNavHandlers(nav, makeKbState()));
      act(() => {
        result.current.handleViewChange("stats");
      });
      expect(nav.setView).toHaveBeenCalledWith("stats");
      expect(window.location.pathname).toBe("/stats");
    });

    it("categories に切り替えると /categories に push される", () => {
      const nav = makeNavState();
      const { result } = renderHook(() => useNavHandlers(nav, makeKbState()));
      act(() => {
        result.current.handleViewChange("categories");
      });
      expect(window.location.pathname).toBe("/categories");
    });

    it("reports に切り替えると /reports に push される", () => {
      const nav = makeNavState();
      const { result } = renderHook(() => useNavHandlers(nav, makeKbState()));
      act(() => {
        result.current.handleViewChange("reports");
      });
      expect(window.location.pathname).toBe("/reports");
    });

    it("articles に切り替えると / に push され feedDetailId / authorName / reportId がリセットされる", () => {
      const nav = makeNavState();
      const { result } = renderHook(() => useNavHandlers(nav, makeKbState()));
      act(() => {
        result.current.handleViewChange("articles");
      });
      expect(nav.setView).toHaveBeenCalledWith("articles");
      expect(nav.setFeedDetailId).toHaveBeenCalledWith("");
      expect(nav.setAuthorName).toHaveBeenCalledWith("");
      expect(nav.setReportId).toHaveBeenCalledWith(0);
      expect(window.location.pathname).toBe("/");
    });
  });

  describe("handleGoToFeedDetail", () => {
    it("feedId を URL エンコードして /feed/<id> に push し setView('feed') を呼ぶ", () => {
      const nav = makeNavState();
      const { result } = renderHook(() => useNavHandlers(nav, makeKbState()));
      act(() => {
        result.current.handleGoToFeedDetail("my-feed");
      });
      expect(nav.setView).toHaveBeenCalledWith("feed");
      expect(nav.setFeedDetailId).toHaveBeenCalledWith("my-feed");
      expect(window.location.pathname).toBe("/feed/my-feed");
    });
  });

  describe("handleBackFromFeedDetail", () => {
    it("/ に push し setView('articles') を呼ぶ", () => {
      const nav = makeNavState();
      const { result } = renderHook(() => useNavHandlers(nav, makeKbState()));
      act(() => {
        result.current.handleBackFromFeedDetail();
      });
      expect(nav.setView).toHaveBeenCalledWith("articles");
      expect(nav.setFeedDetailId).toHaveBeenCalledWith("");
      expect(window.location.pathname).toBe("/");
    });
  });

  describe("handleGoToAuthorDetail", () => {
    it("著者名を URL エンコードして /author/<name> に push し setView('author') を呼ぶ", () => {
      const nav = makeNavState();
      const { result } = renderHook(() => useNavHandlers(nav, makeKbState()));
      act(() => {
        result.current.handleGoToAuthorDetail("Alice");
      });
      expect(nav.setView).toHaveBeenCalledWith("author");
      expect(nav.setAuthorName).toHaveBeenCalledWith("Alice");
      expect(window.location.pathname).toBe("/author/Alice");
    });
  });

  describe("handleBackFromAuthorDetail", () => {
    it("/ に push し setView('articles') を呼ぶ", () => {
      const nav = makeNavState();
      const { result } = renderHook(() => useNavHandlers(nav, makeKbState()));
      act(() => {
        result.current.handleBackFromAuthorDetail();
      });
      expect(nav.setView).toHaveBeenCalledWith("articles");
      expect(nav.setAuthorName).toHaveBeenCalledWith("");
      expect(window.location.pathname).toBe("/");
    });
  });

  describe("handleSelectReport", () => {
    it("/reports/<id> に push し setView('report') と setReportId を呼ぶ", () => {
      const nav = makeNavState();
      const { result } = renderHook(() => useNavHandlers(nav, makeKbState()));
      act(() => {
        result.current.handleSelectReport(42);
      });
      expect(nav.setView).toHaveBeenCalledWith("report");
      expect(nav.setReportId).toHaveBeenCalledWith(42);
      expect(window.location.pathname).toBe("/reports/42");
    });
  });

  describe("handleBackFromReportDetail", () => {
    it("/reports に push し setView('reports') を呼ぶ", () => {
      const nav = makeNavState();
      const { result } = renderHook(() => useNavHandlers(nav, makeKbState()));
      act(() => {
        result.current.handleBackFromReportDetail();
      });
      expect(nav.setView).toHaveBeenCalledWith("reports");
      expect(nav.setReportId).toHaveBeenCalledWith(0);
      expect(window.location.pathname).toBe("/reports");
    });
  });

  // ---- popstate ----

  describe("popstate", () => {
    beforeEach(() => {
      window.history.pushState(null, "", "/");
    });

    it("/stats に遷移して popstate が来ると setView('stats') を呼ぶ", () => {
      const nav = makeNavState();
      renderHook(() => useNavHandlers(nav, makeKbState()));
      window.history.pushState(null, "", "/stats");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(nav.setView).toHaveBeenCalledWith("stats");
    });

    it("/feed/<id> で popstate が来ると setView('feed') と setFeedDetailId を呼ぶ", () => {
      const nav = makeNavState();
      renderHook(() => useNavHandlers(nav, makeKbState()));
      window.history.pushState(null, "", "/feed/test-feed");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(nav.setView).toHaveBeenCalledWith("feed");
      expect(nav.setFeedDetailId).toHaveBeenCalledWith("test-feed");
    });

    it("/author/<name> で popstate が来ると setView('author') と setAuthorName を呼ぶ", () => {
      const nav = makeNavState();
      renderHook(() => useNavHandlers(nav, makeKbState()));
      window.history.pushState(null, "", "/author/Bob");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(nav.setView).toHaveBeenCalledWith("author");
      expect(nav.setAuthorName).toHaveBeenCalledWith("Bob");
    });

    it("/reports/5 で popstate が来ると setView('report') と setReportId(5) を呼ぶ", () => {
      const nav = makeNavState();
      renderHook(() => useNavHandlers(nav, makeKbState()));
      window.history.pushState(null, "", "/reports/5");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(nav.setView).toHaveBeenCalledWith("report");
      expect(nav.setReportId).toHaveBeenCalledWith(5);
    });

    it("/ で popstate が来ると articles 系 state がリセットされる", () => {
      const nav = makeNavState();
      renderHook(() => useNavHandlers(nav, makeKbState()));
      window.history.pushState(null, "", "/");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(nav.setView).toHaveBeenCalledWith("articles");
      expect(nav.setFeedDetailId).toHaveBeenCalledWith("");
      expect(nav.setAuthorName).toHaveBeenCalledWith("");
      expect(nav.setReportId).toHaveBeenCalledWith(0);
    });

    it("アンマウント後は popstate ハンドラが解除される", () => {
      const nav = makeNavState();
      const { unmount } = renderHook(() => useNavHandlers(nav, makeKbState()));
      unmount();
      window.history.pushState(null, "", "/stats");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(nav.setView).not.toHaveBeenCalled();
    });
  });

  // ---- keyboard shortcut callbacks ----

  describe("handleKbNext", () => {
    it("selectedIndex を +1 する (上限は articles.length - 1)", () => {
      const kb = makeKbState({ articles: [makeArticle(1), makeArticle(2)], selectedIndex: 0 });
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      act(() => {
        result.current.handleKbNext();
      });
      const updater = (kb.setSelectedIndex as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect(typeof updater).toBe("function");
      expect((updater as (prev: number) => number)(0)).toBe(1);
      expect((updater as (prev: number) => number)(1)).toBe(1); // 上限でクランプ
    });
  });

  describe("handleKbPrev", () => {
    it("selectedIndex が 0 より大きいとき -1 する", () => {
      const kb = makeKbState({ articles: [makeArticle(1), makeArticle(2)], selectedIndex: 1 });
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      act(() => {
        result.current.handleKbPrev();
      });
      const updater = (kb.setSelectedIndex as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect((updater as (prev: number) => number)(1)).toBe(0);
    });

    it("selectedIndex が 0 のとき 0 のまま", () => {
      const kb = makeKbState({ articles: [makeArticle(1)], selectedIndex: 0 });
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      act(() => {
        result.current.handleKbPrev();
      });
      const updater = (kb.setSelectedIndex as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
      expect((updater as (prev: number) => number)(0)).toBe(0);
    });
  });

  describe("handleKbOpen", () => {
    it("選択中の記事を別タブで開く", () => {
      const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
      const articles = [makeArticle(1), makeArticle(2)];
      const kb = makeKbState({ articles, selectedIndex: 1 });
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      act(() => {
        result.current.handleKbOpen();
      });
      expect(openSpy).toHaveBeenCalledWith(articles[1]?.url, "_blank", "noopener,noreferrer");
      openSpy.mockRestore();
    });

    it("selectedIndex が -1 のときは何もしない", () => {
      const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
      const kb = makeKbState({ articles: [makeArticle(1)], selectedIndex: -1 });
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      act(() => {
        result.current.handleKbOpen();
      });
      expect(openSpy).not.toHaveBeenCalled();
      openSpy.mockRestore();
    });
  });

  describe("handleKbBookmark", () => {
    it("選択中の記事の guid で toggleBookmark を呼ぶ", () => {
      const articles = [makeArticle(1), makeArticle(2)];
      const kb = makeKbState({ articles, selectedIndex: 0 });
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      act(() => {
        result.current.handleKbBookmark();
      });
      expect(kb.toggleBookmark).toHaveBeenCalledWith(articles[0]?.guid);
    });

    it("selectedIndex が範囲外のときは何もしない", () => {
      const kb = makeKbState({ articles: [makeArticle(1)], selectedIndex: 5 });
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      act(() => {
        result.current.handleKbBookmark();
      });
      expect(kb.toggleBookmark).not.toHaveBeenCalled();
    });
  });

  describe("handleKbShowHelp", () => {
    it("setHelpOpen(true) を呼ぶ", () => {
      const kb = makeKbState();
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      act(() => {
        result.current.handleKbShowHelp();
      });
      expect(kb.setHelpOpen).toHaveBeenCalledWith(true);
    });
  });

  describe("handleKbClose", () => {
    it("helpOpen が true のとき setHelpOpen(false) を呼ぶ", () => {
      const kb = makeKbState({ helpOpen: true });
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      act(() => {
        result.current.handleKbClose();
      });
      expect(kb.setHelpOpen).toHaveBeenCalledWith(false);
      expect(kb.setSelectedIndex).not.toHaveBeenCalled();
    });

    it("helpOpen が false のとき setSelectedIndex(-1) を呼ぶ", () => {
      const kb = makeKbState({ helpOpen: false });
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      act(() => {
        result.current.handleKbClose();
      });
      expect(kb.setSelectedIndex).toHaveBeenCalledWith(-1);
      expect(kb.setHelpOpen).not.toHaveBeenCalled();
    });
  });

  describe("handleKbTop", () => {
    it("記事がある場合 setSelectedIndex(0) を呼ぶ", () => {
      const kb = makeKbState({ articles: [makeArticle(1), makeArticle(2)] });
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      act(() => {
        result.current.handleKbTop();
      });
      expect(kb.setSelectedIndex).toHaveBeenCalledWith(0);
    });

    it("記事がない場合 setSelectedIndex(-1) を呼ぶ", () => {
      const kb = makeKbState({ articles: [] });
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      act(() => {
        result.current.handleKbTop();
      });
      expect(kb.setSelectedIndex).toHaveBeenCalledWith(-1);
    });
  });

  describe("handleKbBottom", () => {
    it("記事がある場合 setSelectedIndex(articles.length - 1) を呼ぶ", () => {
      const articles = [makeArticle(1), makeArticle(2), makeArticle(3)];
      const kb = makeKbState({ articles });
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      act(() => {
        result.current.handleKbBottom();
      });
      expect(kb.setSelectedIndex).toHaveBeenCalledWith(2);
    });

    it("記事がない場合 setSelectedIndex(-1) を呼ぶ", () => {
      const kb = makeKbState({ articles: [] });
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      act(() => {
        result.current.handleKbBottom();
      });
      expect(kb.setSelectedIndex).toHaveBeenCalledWith(-1);
    });
  });

  describe("handleSearchFocus", () => {
    it("searchRef.current が存在するとき focus() を呼ぶ", () => {
      const input = document.createElement("input");
      document.body.appendChild(input);
      const focusSpy = vi.spyOn(input, "focus");
      const kb = makeKbState({ searchRef: { current: input } });
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      act(() => {
        result.current.handleSearchFocus();
      });
      expect(focusSpy).toHaveBeenCalledTimes(1);
      document.body.removeChild(input);
    });

    it("searchRef.current が null のときは何もしない (エラーなし)", () => {
      const kb = makeKbState({ searchRef: { current: null } });
      const { result } = renderHook(() => useNavHandlers(makeNavState(), kb));
      expect(() => {
        act(() => {
          result.current.handleSearchFocus();
        });
      }).not.toThrow();
    });
  });
});
