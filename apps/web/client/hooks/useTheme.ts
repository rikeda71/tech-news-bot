import { useCallback, useEffect, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "tnb:theme";

// prefers-color-scheme の現在値を返す (window が無い環境でも crash しない)
function getSystemTheme(): ResolvedTheme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function applyTheme(resolved: ResolvedTheme): void {
  try {
    document.documentElement.setAttribute("data-theme", resolved);
  } catch {
    // SSR / テスト環境で document が無い場合
  }
}

// --- useSyncExternalStore 用ストア ---
type Listener = () => void;
const listeners = new Set<Listener>();

// getSnapshot は呼ばれるたびに localStorage を参照し、同一値なら同じ参照を返す
let cachedRaw: string | null = "__uninitialized__";
let cachedTheme: Theme = "system";

function getSnapshot(): Theme {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedTheme;
  cachedRaw = raw;
  cachedTheme = raw === "light" || raw === "dark" || raw === "system" ? raw : "system";
  return cachedTheme;
}

function getServerSnapshot(): Theme {
  return "system";
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cachedRaw = "__uninitialized__"; // キャッシュ無効化
      listener();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function notify(): void {
  for (const l of listeners) l();
}

function setStoredTheme(next: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // localStorage が無い環境では無視
  }
  cachedRaw = "__uninitialized__"; // キャッシュ無効化して次回 getSnapshot で再読み込み
  const resolved = next === "system" ? getSystemTheme() : next;
  applyTheme(resolved);
  notify();
}

// --- system テーマ時の matchMedia リスナー ---
let mediaQueryList: MediaQueryList | null = null;

function ensureMediaListener(): void {
  try {
    if (mediaQueryList) return;
    mediaQueryList = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQueryList.addEventListener("change", () => {
      const current = getSnapshot();
      if (current === "system") {
        applyTheme(getSystemTheme());
        notify();
      }
    });
  } catch {
    // window が無い環境では無視
  }
}

// --- hook ---

export interface ThemeAPI {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolvedTheme: ResolvedTheme;
}

export function useTheme(): ThemeAPI {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    // マウント時に matchMedia リスナーを登録する (SSR を避けるため useEffect 内)
    ensureMediaListener();
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setStoredTheme(next);
  }, []);

  // system の場合は OS 設定を resolvedTheme として返す
  const resolvedTheme: ResolvedTheme = theme === "system" ? getSystemTheme() : theme;

  return { theme, setTheme, resolvedTheme };
}
