import { useCallback, useEffect, useRef, useState } from "react";
import type { Article } from "../types/api";

interface Options {
  items: Article[];
  onActivate: (id: number, url: string) => void;
  onToggleRead: (id: number) => void;
  onSearchFocus: () => void;
  onClearAll: () => void;
  onShowHelp: () => void;
}

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

export function useKeyboardShortcuts({
  items,
  onActivate,
  onToggleRead,
  onSearchFocus,
  onClearAll,
  onShowHelp,
}: Options): { focusedId: number | null } {
  const [focusedId, setFocusedId] = useState<number | null>(null);
  // ref で items を追跡して keydown handler の closure staleness を避ける
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const focusedIdRef = useRef(focusedId);
  useEffect(() => {
    focusedIdRef.current = focusedId;
  }, [focusedId]);

  const moveFocus = useCallback((dir: 1 | -1) => {
    const list = itemsRef.current;
    if (list.length === 0) return;
    const current = focusedIdRef.current;
    const idx = list.findIndex((a) => a.id === current);
    let next: number;
    if (idx === -1) {
      next = dir === 1 ? 0 : list.length - 1;
    } else {
      next = Math.max(0, Math.min(list.length - 1, idx + dir));
    }
    const nextId = list[next].id;
    setFocusedId(nextId);
    // DOM element を scroll into view
    const el = document.querySelector<HTMLElement>(`[data-article-id="${nextId}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inInput = isInputFocused();

      // Esc は入力欄でも常に処理 (blur / close help)
      if (e.key === "Escape") {
        if (inInput) {
          (document.activeElement as HTMLElement).blur();
        } else {
          onShowHelp(); // HelpModal が open なら close する (toggle)
        }
        return;
      }

      if (inInput) return;

      switch (e.key) {
        case "j":
        case "ArrowDown":
          e.preventDefault();
          moveFocus(1);
          break;
        case "k":
        case "ArrowUp":
          e.preventDefault();
          moveFocus(-1);
          break;
        case "o":
        case "Enter": {
          const id = focusedIdRef.current;
          if (id === null) break;
          const article = itemsRef.current.find((a) => a.id === id);
          if (article) onActivate(id, article.url);
          break;
        }
        case "m": {
          const id = focusedIdRef.current;
          if (id !== null) onToggleRead(id);
          break;
        }
        case "/":
          e.preventDefault();
          onSearchFocus();
          break;
        case "r":
          onClearAll();
          break;
        case "?":
          onShowHelp();
          break;
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [moveFocus, onActivate, onToggleRead, onSearchFocus, onClearAll, onShowHelp]);

  // items が変わったとき、focusedId が存在しなくなっていたらリセット
  useEffect(() => {
    if (focusedId !== null && !items.some((a) => a.id === focusedId)) {
      setFocusedId(null);
    }
  }, [items, focusedId]);

  return { focusedId };
}
