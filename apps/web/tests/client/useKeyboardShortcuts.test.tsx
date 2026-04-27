import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { ShortcutHandlers } from "../../client/hooks/useKeyboardShortcuts";

const { useKeyboardShortcuts } = await import("../../client/hooks/useKeyboardShortcuts");

function makeHandlers(): { [K in keyof ShortcutHandlers]: ReturnType<typeof vi.fn<() => void>> } {
  return {
    onNext: vi.fn<() => void>(),
    onPrev: vi.fn<() => void>(),
    onOpen: vi.fn<() => void>(),
    onBookmark: vi.fn<() => void>(),
    onFocusSearch: vi.fn<() => void>(),
    onShowHelp: vi.fn<() => void>(),
    onClose: vi.fn<() => void>(),
    onTop: vi.fn<() => void>(),
    onBottom: vi.fn<() => void>(),
  };
}

function fire(key: string, options: KeyboardEventInit = {}) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...options }));
  });
}

describe("useKeyboardShortcuts", () => {
  let handlers: ReturnType<typeof makeHandlers>;

  beforeEach(() => {
    handlers = makeHandlers();
    // 入力フォーカスを外す
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("j キーで onNext が呼ばれる", () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    fire("j");
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
  });

  it("ArrowDown キーで onNext が呼ばれる", () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    fire("ArrowDown");
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
  });

  it("k キーで onPrev が呼ばれる", () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    fire("k");
    expect(handlers.onPrev).toHaveBeenCalledTimes(1);
  });

  it("ArrowUp キーで onPrev が呼ばれる", () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    fire("ArrowUp");
    expect(handlers.onPrev).toHaveBeenCalledTimes(1);
  });

  it("Enter キーで onOpen が呼ばれる", () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    fire("Enter");
    expect(handlers.onOpen).toHaveBeenCalledTimes(1);
  });

  it("b キーで onBookmark が呼ばれる", () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    fire("b");
    expect(handlers.onBookmark).toHaveBeenCalledTimes(1);
  });

  it("/ キーで onFocusSearch が呼ばれる", () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    fire("/");
    expect(handlers.onFocusSearch).toHaveBeenCalledTimes(1);
  });

  it("? キーで onShowHelp が呼ばれる", () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    fire("?");
    expect(handlers.onShowHelp).toHaveBeenCalledTimes(1);
  });

  it("Escape キーで onClose が呼ばれる", () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    fire("Escape");
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it("G キーで onBottom が呼ばれる", () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    fire("G");
    expect(handlers.onBottom).toHaveBeenCalledTimes(1);
  });

  it("g g 連打 (タイムアウト内) で onTop が呼ばれる", () => {
    renderHook(() => useKeyboardShortcuts(handlers));
    fire("g");
    expect(handlers.onTop).not.toHaveBeenCalled();
    fire("g");
    expect(handlers.onTop).toHaveBeenCalledTimes(1);
  });

  it("g 単発では onTop が呼ばれない", () => {
    vi.useFakeTimers();
    renderHook(() => useKeyboardShortcuts(handlers));
    fire("g");
    // タイムアウト経過
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(handlers.onTop).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("input フォーカス中は j/k/b/? が呼ばれない", () => {
    renderHook(() => useKeyboardShortcuts(handlers));

    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => {
      input.focus();
    });

    fire("j");
    fire("k");
    fire("b");
    fire("?");
    fire("G");

    expect(handlers.onNext).not.toHaveBeenCalled();
    expect(handlers.onPrev).not.toHaveBeenCalled();
    expect(handlers.onBookmark).not.toHaveBeenCalled();
    expect(handlers.onShowHelp).not.toHaveBeenCalled();
    expect(handlers.onBottom).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("input フォーカス中も Escape では onClose が呼ばれる", () => {
    renderHook(() => useKeyboardShortcuts(handlers));

    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => {
      input.focus();
    });

    fire("Escape");
    expect(handlers.onClose).toHaveBeenCalledTimes(1);

    document.body.removeChild(input);
  });

  it("enabled=false のとき何も呼ばれない", () => {
    renderHook(() => useKeyboardShortcuts(handlers, false));
    fire("j");
    fire("k");
    fire("Enter");
    fire("Escape");
    for (const fn of Object.values(handlers)) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it("アンマウント後はイベントハンドラが解除される", () => {
    const { unmount } = renderHook(() => useKeyboardShortcuts(handlers));
    unmount();
    fire("j");
    expect(handlers.onNext).not.toHaveBeenCalled();
  });
});
