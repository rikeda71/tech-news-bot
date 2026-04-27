import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
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

// リスナーが window に残らないよう各テスト内で unmount を呼ぶヘルパー
function setup() {
  const onMarkRead = vi.fn<(id: number) => void>();
  const onToggleStar = vi.fn<(id: number) => void>();
  const h = renderHook(() => useKeyboardNav({ articles, onMarkRead, onToggleStar }));
  return { ...h, onMarkRead, onToggleStar };
}

describe("useKeyboardNav", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("initially focusedIndex is null", () => {
    const h = setup();
    try {
      expect(h.result.current.focusedIndex).toBeNull();
    } finally {
      h.unmount();
    }
  });

  it("j moves focus to first article when no selection", () => {
    const h = setup();
    try {
      act(() => {
        fireKey("j");
      });
      expect(h.result.current.focusedIndex).toBe(0);
    } finally {
      h.unmount();
    }
  });

  it("ArrowDown moves focus to next article", () => {
    const h = setup();
    try {
      act(() => {
        fireKey("ArrowDown");
      });
      act(() => {
        fireKey("ArrowDown");
      });
      expect(h.result.current.focusedIndex).toBe(1);
    } finally {
      h.unmount();
    }
  });

  it("k moves focus to last article when no selection", () => {
    const h = setup();
    try {
      act(() => {
        fireKey("k");
      });
      expect(h.result.current.focusedIndex).toBe(2);
    } finally {
      h.unmount();
    }
  });

  it("ArrowUp moves focus to previous article", () => {
    const h = setup();
    try {
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
    } finally {
      h.unmount();
    }
  });

  it("j does not exceed last index", () => {
    const h = setup();
    try {
      act(() => {
        fireKey("j");
      });
      act(() => {
        fireKey("j");
      });
      act(() => {
        fireKey("j");
      });
      act(() => {
        fireKey("j");
      });
      expect(h.result.current.focusedIndex).toBe(2);
    } finally {
      h.unmount();
    }
  });

  it("k does not go below index 0", () => {
    const h = setup();
    try {
      act(() => {
        fireKey("j");
      });
      act(() => {
        fireKey("k");
      });
      act(() => {
        fireKey("k");
      });
      expect(h.result.current.focusedIndex).toBe(0);
    } finally {
      h.unmount();
    }
  });

  it("m calls onMarkRead with focused article id", () => {
    const h = setup();
    try {
      act(() => {
        fireKey("j");
      });
      act(() => {
        fireKey("m");
      });
      expect(h.onMarkRead).toHaveBeenCalledWith(10);
    } finally {
      h.unmount();
    }
  });

  it("m does nothing when no article is focused", () => {
    const h = setup();
    try {
      act(() => {
        fireKey("m");
      });
      expect(h.onMarkRead).not.toHaveBeenCalled();
    } finally {
      h.unmount();
    }
  });

  it("s calls onToggleStar with focused article id", () => {
    const h = setup();
    try {
      act(() => {
        fireKey("j");
      });
      act(() => {
        fireKey("s");
      });
      expect(h.onToggleStar).toHaveBeenCalledWith(10);
    } finally {
      h.unmount();
    }
  });

  it("s does nothing when no article is focused", () => {
    const h = setup();
    try {
      act(() => {
        fireKey("s");
      });
      expect(h.onToggleStar).not.toHaveBeenCalled();
    } finally {
      h.unmount();
    }
  });

  it("? toggles helpOpen", () => {
    const h = setup();
    try {
      expect(h.result.current.helpOpen).toBe(false);
      act(() => {
        fireKey("?");
      });
      expect(h.result.current.helpOpen).toBe(true);
      act(() => {
        fireKey("?");
      });
      expect(h.result.current.helpOpen).toBe(false);
    } finally {
      h.unmount();
    }
  });

  it("Escape closes helpOpen when open", () => {
    const h = setup();
    try {
      act(() => {
        fireKey("?");
      });
      expect(h.result.current.helpOpen).toBe(true);
      act(() => {
        fireKey("Escape");
      });
      expect(h.result.current.helpOpen).toBe(false);
    } finally {
      h.unmount();
    }
  });

  it("focusedIndex resets to last when articles shrink below current index", () => {
    const onMarkRead = vi.fn<(id: number) => void>();
    const onToggleStar = vi.fn<(id: number) => void>();
    const h = renderHook(
      ({ arts }) => useKeyboardNav({ articles: arts, onMarkRead, onToggleStar }),
      { initialProps: { arts: articles } },
    );
    try {
      act(() => {
        fireKey("j");
      });
      act(() => {
        fireKey("j");
      });
      act(() => {
        fireKey("j");
      });
      expect(h.result.current.focusedIndex).toBe(2);
      h.rerender({ arts: [makeArticle(10)] });
      expect(h.result.current.focusedIndex).toBe(0);
    } finally {
      h.unmount();
    }
  });
});
