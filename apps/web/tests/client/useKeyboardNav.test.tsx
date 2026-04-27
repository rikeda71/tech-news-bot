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

  beforeEach(() => {
    onMarkRead = vi.fn<(id: number) => void>();
    onToggleStar = vi.fn<(id: number) => void>();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("initially focusedIndex is null", () => {
    const { result } = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    expect(result.current.focusedIndex).toBeNull();
  });

  it("j moves focus to first article when no selection", () => {
    const { result } = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    act(() => {
      fireKey("j");
    });
    expect(result.current.focusedIndex).toBe(0);
  });

  it("ArrowDown moves focus to next article", () => {
    const { result } = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    act(() => {
      fireKey("ArrowDown");
    });
    act(() => {
      fireKey("ArrowDown");
    });
    expect(result.current.focusedIndex).toBe(1);
  });

  it("k moves focus to last article when no selection", () => {
    const { result } = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    act(() => {
      fireKey("k");
    });
    expect(result.current.focusedIndex).toBe(2);
  });

  it("ArrowUp moves focus to previous article", () => {
    const { result } = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    act(() => {
      fireKey("j");
    });
    act(() => {
      fireKey("j");
    });
    act(() => {
      fireKey("ArrowUp");
    });
    expect(result.current.focusedIndex).toBe(0);
  });

  it("j does not exceed last index", () => {
    const { result } = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    act(() => {
      fireKey("j");
      fireKey("j");
      fireKey("j");
      fireKey("j");
    });
    expect(result.current.focusedIndex).toBe(2);
  });

  it("k does not go below index 0", () => {
    const { result } = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    act(() => {
      fireKey("j");
      fireKey("k");
      fireKey("k");
    });
    expect(result.current.focusedIndex).toBe(0);
  });

  it("m calls onMarkRead with focused article id", () => {
    renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    act(() => {
      fireKey("j");
    });
    act(() => {
      fireKey("m");
    });
    expect(onMarkRead).toHaveBeenCalledWith(10);
  });

  it("m does nothing when no article is focused", () => {
    renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    act(() => {
      fireKey("m");
    });
    expect(onMarkRead).not.toHaveBeenCalled();
  });

  it("s calls onToggleStar with focused article id", () => {
    renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    act(() => {
      fireKey("j");
    });
    act(() => {
      fireKey("s");
    });
    expect(onToggleStar).toHaveBeenCalledWith(10);
  });

  it("s does nothing when no article is focused", () => {
    renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    act(() => {
      fireKey("s");
    });
    expect(onToggleStar).not.toHaveBeenCalled();
  });

  it("? toggles helpOpen", () => {
    const { result } = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    expect(result.current.helpOpen).toBe(false);
    act(() => {
      fireKey("?");
    });
    expect(result.current.helpOpen).toBe(true);
    act(() => {
      fireKey("?");
    });
    expect(result.current.helpOpen).toBe(false);
  });

  it("Escape closes helpOpen when open", () => {
    const { result } = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
    act(() => {
      fireKey("?");
    });
    expect(result.current.helpOpen).toBe(true);
    act(() => {
      fireKey("Escape");
    });
    expect(result.current.helpOpen).toBe(false);
  });

  it("focusedIndex resets to last when articles shrink below current index", () => {
    const { result, rerender } = renderHook(
      ({ arts }) => useKeyboardNav({ articles: arts, onMarkRead, onToggleStar }),
      { initialProps: { arts: articles } },
    );
    act(() => {
      fireKey("j");
      fireKey("j");
      fireKey("j");
    });
    expect(result.current.focusedIndex).toBe(2);
    rerender({ arts: [makeArticle(10)] });
    expect(result.current.focusedIndex).toBe(0);
  });
});
