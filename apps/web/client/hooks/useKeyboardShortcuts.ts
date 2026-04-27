import { useEffect, useRef } from "react";

export type ShortcutHandlers = {
  onNext: () => void;
  onPrev: () => void;
  onOpen: () => void;
  onBookmark: () => void;
  onFocusSearch: () => void;
  onShowHelp: () => void;
  onClose: () => void;
  onTop: () => void;
  onBottom: () => void;
};

function isInputFocused(): boolean {
  const t = document.activeElement;
  if (!t) return false;
  return (
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    t instanceof HTMLSelectElement ||
    (t as HTMLElement).isContentEditable
  );
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled = true): void {
  // ref で handlers を追跡して keydown handler の closure staleness を避ける
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // g 連打のタイムアウト管理
  const gPendingRef = useRef(false);
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;

    const handler = (e: KeyboardEvent) => {
      const inInput = isInputFocused();
      const h = handlersRef.current;

      // Esc は入力欄でも常に処理 (blur / close)
      if (e.key === "Escape") {
        h.onClose();
        if (inInput) {
          (document.activeElement as HTMLElement).blur();
        }
        return;
      }

      if (inInput) return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          h.onNext();
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          h.onPrev();
          break;
        case "Enter":
          h.onOpen();
          break;
        case "b":
          h.onBookmark();
          break;
        case "/":
          e.preventDefault();
          h.onFocusSearch();
          break;
        case "?":
          h.onShowHelp();
          break;
        case "g": {
          if (gPendingRef.current) {
            // 2回目の g → 先頭へ
            if (gTimerRef.current !== null) {
              clearTimeout(gTimerRef.current);
              gTimerRef.current = null;
            }
            gPendingRef.current = false;
            h.onTop();
          } else {
            // 1回目の g → 500ms 以内に再度 g を待つ
            gPendingRef.current = true;
            gTimerRef.current = setTimeout(() => {
              gPendingRef.current = false;
              gTimerRef.current = null;
            }, 500);
          }
          break;
        }
        case "G":
          h.onBottom();
          break;
      }
    };

    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      // クリーンアップ時にタイマーもリセット
      if (gTimerRef.current !== null) {
        clearTimeout(gTimerRef.current);
        gTimerRef.current = null;
      }
      gPendingRef.current = false;
    };
  }, [enabled]);
}
