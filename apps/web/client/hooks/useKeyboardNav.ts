import { useCallback, useEffect, useRef, useState } from "react";
import type { Article } from "../types/api";

interface Options {
  articles: Article[];
  onMarkRead: (id: number) => void;
  onToggleStar: (id: number) => void;
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

export interface KeyboardNavResult {
  focusedIndex: number | null;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
}

export function useKeyboardNav({ articles, onMarkRead, onToggleStar }: Options): KeyboardNavResult {
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // ref で最新値を保持して keydown handler の closure staleness を避ける
  const articlesRef = useRef(articles);
  useEffect(() => {
    articlesRef.current = articles;
  }, [articles]);

  const focusedIndexRef = useRef(focusedIndex);
  useEffect(() => {
    focusedIndexRef.current = focusedIndex;
  }, [focusedIndex]);

  const helpOpenRef = useRef(helpOpen);
  useEffect(() => {
    helpOpenRef.current = helpOpen;
  }, [helpOpen]);

  const moveFocus = useCallback((dir: 1 | -1) => {
    const list = articlesRef.current;
    if (list.length === 0) return;
    const current = focusedIndexRef.current;
    let next: number;
    if (current === null) {
      next = dir === 1 ? 0 : list.length - 1;
    } else {
      next = Math.max(0, Math.min(list.length - 1, current + dir));
    }
    setFocusedIndex(next);
    const article = list[next];
    const el = document.querySelector<HTMLElement>(`[data-article-id="${article.id}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inInput = isInputFocused();

      // Esc は入力欄でも常に処理 (help modal を閉じる / 検索バーから離れる)
      if (e.key === "Escape") {
        if (helpOpenRef.current) {
          setHelpOpen(false);
        } else if (inInput) {
          (document.activeElement as HTMLElement).blur();
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
          const idx = focusedIndexRef.current;
          if (idx === null) break;
          const article = articlesRef.current[idx];
          if (article) {
            window.open(article.url, "_blank", "noopener,noreferrer");
          }
          break;
        }
        case "m": {
          const idx = focusedIndexRef.current;
          if (idx !== null) {
            const article = articlesRef.current[idx];
            if (article) onMarkRead(article.id);
          }
          break;
        }
        case "s": {
          const idx = focusedIndexRef.current;
          if (idx !== null) {
            const article = articlesRef.current[idx];
            if (article) onToggleStar(article.id);
          }
          break;
        }
        case "?":
          setHelpOpen((prev) => !prev);
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [moveFocus, onMarkRead, onToggleStar]);

  // articles が変わったとき、focusedIndex が範囲外になっていたらリセット
  useEffect(() => {
    if (focusedIndex !== null && focusedIndex >= articles.length) {
      setFocusedIndex(articles.length > 0 ? articles.length - 1 : null);
    }
  }, [articles, focusedIndex]);

  return { focusedIndex, helpOpen, setHelpOpen };
}
