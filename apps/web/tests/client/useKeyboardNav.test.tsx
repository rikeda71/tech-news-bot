import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Article } from "../../client/types/api";

const { useKeyboardNav } = await import("../../client/hooks/useKeyboardNav");

const makeArticle = (id: number): Article => ({
  id,
  guid: `guid-${id}`,
  feed_id: "feed-a",
  feed_name: "Feed A",
  title: `Article ${id}`,
  url: `https://example.com/${id}`,
  summary: null,
  author: null,
  published_at: "2024-01-01T00:00:00Z",
  fetched_at: "2024-01-01T01:00:00Z",
  category: "ai",
  lang: "en",
});

const articles = [makeArticle(10), makeArticle(20), makeArticle(30)];

function fireKey(key: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("useKeyboardNav", () => {
  let onMarkRead: ReturnType<typeof vi.fn<(id: number) => void>>;
  let onToggleStar: ReturnType<typeof vi.fn<(id: number) => void>>;
  // window に残るリスナーを分離するため各テストで unmount を追跡する
  let unmount: () => void;

  beforeEach(() => {
    onMarkRead = vi.fn<(id: number) => void>();
    onToggleStar = vi.fn<(id: number) => void>();
    unmount = () => {};
  });

  afterEach(() => {
    // リスナーが window に残らないよう確実にアンマウントする
    unmount();
    vi.clearAllMocks();
  });

  it("initially focusedIndex is null", () => {
    const h = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    unmount = h.unmount;
    expect(h.result.current.focusedIndex).toBeNull();
  });

  it("j moves focus to first article when no selection", () => {
    const h = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    unmount = h.unmount;
    act(() => {
      fireKey("j");
    });
    expect(h.result.current.focusedIndex).toBe(0);
  });

  it("ArrowDown moves focus to next article", () => {
    const h = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    unmount = h.unmount;
    act(() => {
      fireKey("ArrowDown");
    });
    act(() => {
      fireKey("ArrowDown");
    });
    expect(h.result.current.focusedIndex).toBe(1);
  });

  it("k moves focus to last article when no selection", () => {
    const h = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    unmount = h.unmount;
    act(() => {
      fireKey("k");
    });
    expect(h.result.current.focusedIndex).toBe(2);
  });

  it("ArrowUp moves focus to previous article", () => {
    const h = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    unmount = h.unmount;
    act(() => {
      fireKey("j");
    });
    act(() => {
      fireKey("j");
    });
    act(() => {
      fireKey("ArrowUp");
    });
    expect(h.result.current.focusedIndex).toBe(0);
  });

  it("j does not exceed last index", () => {
    const h = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    unmount = h.unmount;
    act(() => {
      fireKey("j");
      fireKey("j");
      fireKey("j");
      fireKey("j");
    });
    expect(h.result.current.focusedIndex).toBe(2);
  });

  it("k does not go below index 0", () => {
    const h = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    unmount = h.unmount;
    act(() => {
      fireKey("j");
      fireKey("k");
      fireKey("k");
    });
    expect(h.result.current.focusedIndex).toBe(0);
  });

  it("m calls onMarkRead with focused article id", () => {
    const h = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    unmount = h.unmount;
    act(() => {
      fireKey("j");
    });
    act(() => {
      fireKey("m");
    });
    expect(onMarkRead).toHaveBeenCalledWith(10);
  });

  it("m does nothing when no article is focused", () => {
    const h = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    unmount = h.unmount;
    act(() => {
      fireKey("m");
    });
    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it("s calls onToggleStar with focused article id", () => {
    const h = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    unmount = h.unmount;
    act(() => {
      fireKey("j");
    });
    act(() => {
      fireKey("s");
    });
    expect(onToggleStar).toHaveBeenCalledWith(10);
  });

  it("s does nothing when no article is focused", () => {
    const h = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    unmount = h.unmount;
    act(() => {
      fireKey("s");
    });
    expect(onToggleStar).not.toHaveBeenCalled();
  });

  it("? toggles helpOpen", () => {
    const h = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    unmount = h.unmount;
    expect(h.result.current.helpOpen).toBe(false);
    act(() => {
      fireKey("?");
    });
    expect(h.result.current.helpOpen).toBe(true);
    act(() => {
      fireKey("?");
    });
    expect(h.result.current.helpOpen).toBe(false);
  });

  it("Escape closes helpOpen when open", () => {
    const h = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    unmount = h.unmount;
    act(() => {
      fireKey("?");
    });
    expect(h.result.current.helpOpen).toBe(true);
    act(() => {
      fireKey("Escape");
    });
    expect(h.result.current.helpOpen).toBe(false);
  });

  it("focusedIndex resets to last when articles shrink below current index", () => {
    const h = renderHook(
      ({ arts }) => useKeyboardNav({ articles: arts, onMarkRead, onToggleStar }),
      { initialProps: { arts: articles } },
    );
    unmount = h.unmount;
    act(() => {
      fireKey("j");
      fireKey("j");
      fireKey("j");
    });
    expect(h.result.current.focusedIndex).toBe(2);
    h.rerender({ arts: [makeArticle(10)] });
    expect(h.result.current.focusedIndex).toBe(0);
  });
});
