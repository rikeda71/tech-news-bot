import { useCallback, useRef, useSyncExternalStore } from "react";
import { isFeedCategory, isFeedLang } from "../lib/feed-categories";
import type { FeedCategory, FeedLang } from "../types/api";

export type FilterState = {
  q: string;
  category: FeedCategory | "";
  lang: FeedLang | "";
  bookmarksOnly: boolean;
};

const DEFAULT_STATE: FilterState = {
  q: "",
  category: "",
  lang: "",
  bookmarksOnly: false,
};

// parse はテストから直接使えるように export する
export function parseSearch(search: string): FilterState {
  const params = new URLSearchParams(search);
  const category = params.get("category") ?? "";
  const lang = params.get("lang") ?? "";
  return {
    q: params.get("q") ?? "",
    category: isFeedCategory(category) ? category : "",
    lang: isFeedLang(lang) ? lang : "",
    bookmarksOnly: params.get("bookmarks") === "only",
  };
}

// 現在の URL の全パラメータを保持しつつ、管理対象の 4 つだけを上書きする
export function serializeState(state: FilterState): string {
  // 既存の URL パラメータ (feedId, dateFrom, etc.) を引き継ぐ
  const params = new URLSearchParams(window.location.search);
  if (state.q) {
    params.set("q", state.q);
  } else {
    params.delete("q");
  }
  if (state.category) {
    params.set("category", state.category);
  } else {
    params.delete("category");
  }
  if (state.lang) {
    params.set("lang", state.lang);
  } else {
    params.delete("lang");
  }
  if (state.bookmarksOnly) {
    params.set("bookmarks", "only");
  } else {
    params.delete("bookmarks");
  }
  const s = params.toString();
  return s ? `?${s}` : window.location.pathname;
}

// useSyncExternalStore の getSnapshot は参照同一性を要求するため
// search 文字列をキャッシュキーにして同一内容なら同じオブジェクト参照を返す
let cachedSearch: string | null = null;
let cachedState: FilterState = { ...DEFAULT_STATE };

function getSnapshot(): FilterState {
  const search = window.location.search;
  if (search === cachedSearch) return cachedState;
  cachedSearch = search;
  cachedState = parseSearch(search);
  return cachedState;
}

function getServerSnapshot(): FilterState {
  return DEFAULT_STATE;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

function notify(): void {
  for (const l of listeners) l();
}

const DEBOUNCE_MS = 300;

export function useUrlState(): readonly [FilterState, (patch: Partial<FilterState>) => void] {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // debounce タイマーの ref
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // debounce 中に積み上げる patch をマージして保持する ref
  const pendingRef = useRef<Partial<FilterState>>({});

  const setFilters = useCallback((patch: Partial<FilterState>) => {
    // 新しい patch を pending にマージ
    pendingRef.current = { ...pendingRef.current, ...patch };

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const current = getSnapshot();
      const next: FilterState = { ...current, ...pendingRef.current };
      pendingRef.current = {};
      const newSearch = serializeState(next);
      const currentSearch = window.location.search || window.location.pathname;
      // 内容が変わった時だけ replaceState を呼ぶ
      if (newSearch !== currentSearch) {
        window.history.replaceState(null, "", newSearch);
      }
      // キャッシュを無効化して再 subscribe
      cachedSearch = null;
      notify();
    }, DEBOUNCE_MS);
  }, []);

  return [state, setFilters] as const;
}
