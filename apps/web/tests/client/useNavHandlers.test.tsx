import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
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

/** 全 NavState + KbState を実 useState で保持するヘルパーフック */
function useTestHook(
  initialArticles: Article[] = [],
  initialSelectedIndex = -1,
  initialHelpOpen = false,
) {
  const [view, setView] = useState<import("../../client/components/Header").AppView>("articles");
  const [feedDetailId, setFeedDetailId] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [reportId, setReportId] = useState(0);
  const [feedId, setFeedId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [starredOnly, setStarredOnly] = useState(false);

  const [articles] = useState<Article[]>(initialArticles);
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex);
  const [helpOpen, setHelpOpen] = useState(initialHelpOpen);
  const toggleBookmark = vi.fn<(guid: string) => void>();
  const searchRef = { current: null as HTMLInputElement | null };

  const handlers = useNavHandlers(
    {
      setView,
      setFeedDetailId,
      setAuthorName,
      setReportId,
      setFeedId,
      setDateFrom,
      setDateTo,
      setUnreadOnly,
      setStarredOnly,
    },
    {
      articles,
      selectedIndex,
      helpOpen,
      setSelectedIndex,
      setHelpOpen,
      toggleBookmark,
      searchRef,
    },
  );

  return {
    view,
    feedDetailId,
    authorName,
    reportId,
    feedId,
    dateFrom,
    dateTo,
    unreadOnly,
    starredOnly,
    selectedIndex,
    helpOpen,
    toggleBookmark,
    searchRef,
    handlers,
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
    it("stats に切り替えると view が 'stats' になり history が push される", () => {
      const { result } = renderHook(() => useTestHook());
      act(() => {
        result.current.handlers.handleViewChange("stats");
      });
      expect.soft(result.current.view).toBe("stats");
      expect.soft(window.location.pathname).toBe("/stats");
    });

    it("categories に切り替えると view が 'categories' になり /categories に push される", () => {
      const { result } = renderHook(() => useTestHook());
      act(() => {
        result.current.handlers.handleViewChange("categories");
      });
      expect.soft(result.current.view).toBe("categories");
      expect.soft(window.location.pathname).toBe("/categories");
    });

    it("reports に切り替えると view が 'reports' になり /reports に push される", () => {
      const { result } = renderHook(() => useTestHook());
      act(() => {
        result.current.handlers.handleViewChange("reports");
      });
      expect.soft(result.current.view).toBe("reports");
      expect.soft(window.location.pathname).toBe("/reports");
    });

    it("articles に切り替えると view / feedDetailId / authorName / reportId がリセットされる", () => {
      const { result } = renderHook(() => useTestHook());
      act(() => {
        result.current.handlers.handleViewChange("articles");
      });
      expect.soft(result.current.view).toBe("articles");
      expect.soft(result.current.feedDetailId).toBe("");
      expect.soft(result.current.authorName).toBe("");
      expect.soft(result.current.reportId).toBe(0);
      expect.soft(window.location.pathname).toBe("/");
    });
  });

  describe("handleGoToFeedDetail", () => {
    it("feedId を URL エンコードして /feed/<id> に push し view が 'feed' になる", () => {
      const { result } = renderHook(() => useTestHook());
      act(() => {
        result.current.handlers.handleGoToFeedDetail("my-feed");
      });
      expect.soft(result.current.view).toBe("feed");
      expect.soft(result.current.feedDetailId).toBe("my-feed");
      expect.soft(window.location.pathname).toBe("/feed/my-feed");
    });
  });

  describe("handleBackFromFeedDetail", () => {
    it("/ に push し view が 'articles'、feedDetailId が '' になる", () => {
      const { result } = renderHook(() => useTestHook());
      act(() => {
        result.current.handlers.handleGoToFeedDetail("my-feed");
      });
      act(() => {
        result.current.handlers.handleBackFromFeedDetail();
      });
      expect.soft(result.current.view).toBe("articles");
      expect.soft(result.current.feedDetailId).toBe("");
      expect.soft(window.location.pathname).toBe("/");
    });
  });

  describe("handleGoToAuthorDetail", () => {
    it("著者名を URL エンコードして /author/<name> に push し view が 'author' になる", () => {
      const { result } = renderHook(() => useTestHook());
      act(() => {
        result.current.handlers.handleGoToAuthorDetail("Alice");
      });
      expect.soft(result.current.view).toBe("author");
      expect.soft(result.current.authorName).toBe("Alice");
      expect.soft(window.location.pathname).toBe("/author/Alice");
    });
  });

  describe("handleBackFromAuthorDetail", () => {
    it("/ に push し view が 'articles'、authorName が '' になる", () => {
      const { result } = renderHook(() => useTestHook());
      act(() => {
        result.current.handlers.handleGoToAuthorDetail("Alice");
      });
      act(() => {
        result.current.handlers.handleBackFromAuthorDetail();
      });
      expect.soft(result.current.view).toBe("articles");
      expect.soft(result.current.authorName).toBe("");
      expect.soft(window.location.pathname).toBe("/");
    });
  });

  describe("handleSelectReport", () => {
    it("/reports/<id> に push し view が 'report'、reportId が設定される", () => {
      const { result } = renderHook(() => useTestHook());
      act(() => {
        result.current.handlers.handleSelectReport(42);
      });
      expect.soft(result.current.view).toBe("report");
      expect.soft(result.current.reportId).toBe(42);
      expect.soft(window.location.pathname).toBe("/reports/42");
    });
  });

  describe("handleBackFromReportDetail", () => {
    it("/reports に push し view が 'reports'、reportId が 0 になる", () => {
      const { result } = renderHook(() => useTestHook());
      act(() => {
        result.current.handlers.handleSelectReport(42);
      });
      act(() => {
        result.current.handlers.handleBackFromReportDetail();
      });
      expect.soft(result.current.view).toBe("reports");
      expect.soft(result.current.reportId).toBe(0);
      expect.soft(window.location.pathname).toBe("/reports");
    });
  });

  // ---- popstate ----

  describe("popstate", () => {
    it("/stats に遷移して popstate が来ると view が 'stats' になる", () => {
      const { result } = renderHook(() => useTestHook());
      window.history.pushState(null, "", "/stats");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(result.current.view).toBe("stats");
    });

    it("/feed/<id> で popstate が来ると view が 'feed'、feedDetailId が設定される", () => {
      const { result } = renderHook(() => useTestHook());
      window.history.pushState(null, "", "/feed/test-feed");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect.soft(result.current.view).toBe("feed");
      expect.soft(result.current.feedDetailId).toBe("test-feed");
    });

    it("/author/<name> で popstate が来ると view が 'author'、authorName が設定される", () => {
      const { result } = renderHook(() => useTestHook());
      window.history.pushState(null, "", "/author/Bob");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect.soft(result.current.view).toBe("author");
      expect.soft(result.current.authorName).toBe("Bob");
    });

    it("/reports/5 で popstate が来ると view が 'report'、reportId が 5 になる", () => {
      const { result } = renderHook(() => useTestHook());
      window.history.pushState(null, "", "/reports/5");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect.soft(result.current.view).toBe("report");
      expect.soft(result.current.reportId).toBe(5);
    });

    it("/ で popstate が来ると articles 系 state がリセットされる", () => {
      const { result } = renderHook(() => useTestHook());
      window.history.pushState(null, "", "/");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect.soft(result.current.view).toBe("articles");
      expect.soft(result.current.feedDetailId).toBe("");
      expect.soft(result.current.authorName).toBe("");
      expect.soft(result.current.reportId).toBe(0);
    });

    it("アンマウント後は popstate ハンドラが解除される", () => {
      const { result, unmount } = renderHook(() => useTestHook());
      const viewBefore = result.current.view;
      unmount();
      window.history.pushState(null, "", "/stats");
      act(() => {
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      // アンマウント後は state 更新されないので view は変わらないはず
      expect(result.current.view).toBe(viewBefore);
    });
  });

  // ---- keyboard shortcut callbacks ----

  describe("handleKbNext", () => {
    it("selectedIndex を +1 する", () => {
      const articles = [makeArticle(1), makeArticle(2)];
      const { result } = renderHook(() => useTestHook(articles, 0));
      act(() => {
        result.current.handlers.handleKbNext();
      });
      expect(result.current.selectedIndex).toBe(1);
    });

    it("selectedIndex が上限 (articles.length - 1) でクランプされる", () => {
      const articles = [makeArticle(1), makeArticle(2)];
      const { result } = renderHook(() => useTestHook(articles, 1));
      act(() => {
        result.current.handlers.handleKbNext();
      });
      expect(result.current.selectedIndex).toBe(1);
    });
  });

  describe("handleKbPrev", () => {
    it("selectedIndex が 0 より大きいとき -1 する", () => {
      const articles = [makeArticle(1), makeArticle(2)];
      const { result } = renderHook(() => useTestHook(articles, 1));
      act(() => {
        result.current.handlers.handleKbPrev();
      });
      expect(result.current.selectedIndex).toBe(0);
    });

    it("selectedIndex が 0 のとき 0 のまま", () => {
      const articles = [makeArticle(1)];
      const { result } = renderHook(() => useTestHook(articles, 0));
      act(() => {
        result.current.handlers.handleKbPrev();
      });
      expect(result.current.selectedIndex).toBe(0);
    });
  });

  describe("handleKbOpen", () => {
    it("選択中の記事を別タブで開く", () => {
      const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
      const articles = [makeArticle(1), makeArticle(2)];
      const { result } = renderHook(() => useTestHook(articles, 1));
      act(() => {
        result.current.handlers.handleKbOpen();
      });
      expect(openSpy).toHaveBeenCalledWith(articles[1]?.url, "_blank", "noopener,noreferrer");
      openSpy.mockRestore();
    });

    it("selectedIndex が -1 のときは何もしない", () => {
      const openSpy = vi.spyOn(window, "open").mockReturnValue(null);
      const articles = [makeArticle(1)];
      const { result } = renderHook(() => useTestHook(articles, -1));
      act(() => {
        result.current.handlers.handleKbOpen();
      });
      expect(openSpy).not.toHaveBeenCalled();
      openSpy.mockRestore();
    });
  });

  describe("handleKbBookmark", () => {
    it("選択中の記事の guid で toggleBookmark を呼ぶ", () => {
      const articles = [makeArticle(1), makeArticle(2)];
      const { result } = renderHook(() => useTestHook(articles, 0));
      act(() => {
        result.current.handlers.handleKbBookmark();
      });
      expect(result.current.toggleBookmark).toHaveBeenCalledWith(articles[0]?.guid);
    });

    it("selectedIndex が範囲外のときは何もしない", () => {
      const articles = [makeArticle(1)];
      const { result } = renderHook(() => useTestHook(articles, 5));
      act(() => {
        result.current.handlers.handleKbBookmark();
      });
      expect(result.current.toggleBookmark).not.toHaveBeenCalled();
    });
  });

  describe("handleKbShowHelp", () => {
    it("helpOpen が true になる", () => {
      const { result } = renderHook(() => useTestHook([], -1, false));
      act(() => {
        result.current.handlers.handleKbShowHelp();
      });
      expect(result.current.helpOpen).toBe(true);
    });
  });

  describe("handleKbClose", () => {
    it("helpOpen が true のとき helpOpen が false になる", () => {
      const { result } = renderHook(() => useTestHook([], -1, true));
      act(() => {
        result.current.handlers.handleKbClose();
      });
      expect.soft(result.current.helpOpen).toBe(false);
      expect.soft(result.current.selectedIndex).toBe(-1); // selectedIndex は変わらない
    });

    it("helpOpen が false のとき selectedIndex が -1 になる", () => {
      const articles = [makeArticle(1), makeArticle(2)];
      const { result } = renderHook(() => useTestHook(articles, 1, false));
      act(() => {
        result.current.handlers.handleKbClose();
      });
      expect.soft(result.current.selectedIndex).toBe(-1);
      expect.soft(result.current.helpOpen).toBe(false); // helpOpen は変わらない
    });
  });

  describe("handleKbTop", () => {
    it("記事がある場合 selectedIndex が 0 になる", () => {
      const articles = [makeArticle(1), makeArticle(2)];
      const { result } = renderHook(() => useTestHook(articles, 1));
      act(() => {
        result.current.handlers.handleKbTop();
      });
      expect(result.current.selectedIndex).toBe(0);
    });

    it("記事がない場合 selectedIndex が -1 になる", () => {
      const { result } = renderHook(() => useTestHook([], 0));
      act(() => {
        result.current.handlers.handleKbTop();
      });
      expect(result.current.selectedIndex).toBe(-1);
    });
  });

  describe("handleKbBottom", () => {
    it("記事がある場合 selectedIndex が articles.length - 1 になる", () => {
      const articles = [makeArticle(1), makeArticle(2), makeArticle(3)];
      const { result } = renderHook(() => useTestHook(articles, 0));
      act(() => {
        result.current.handlers.handleKbBottom();
      });
      expect(result.current.selectedIndex).toBe(2);
    });

    it("記事がない場合 selectedIndex が -1 になる", () => {
      const { result } = renderHook(() => useTestHook([], 0));
      act(() => {
        result.current.handlers.handleKbBottom();
      });
      expect(result.current.selectedIndex).toBe(-1);
    });
  });

  describe("handleSearchFocus", () => {
    it("searchRef.current が存在するとき focus() を呼ぶ", () => {
      const input = document.createElement("input");
      document.body.appendChild(input);
      const focusSpy = vi.spyOn(input, "focus");
      const { result } = renderHook(() => {
        const state = useTestHook();
        state.searchRef.current = input;
        return state;
      });
      act(() => {
        result.current.handlers.handleSearchFocus();
      });
      expect(focusSpy).toHaveBeenCalledTimes(1);
      document.body.removeChild(input);
    });

    it("searchRef.current が null のときは何もしない (エラーなし)", () => {
      const { result } = renderHook(() => useTestHook());
      expect(() => {
        act(() => {
          result.current.handlers.handleSearchFocus();
        });
      }).not.toThrow();
    });
  });
});
