import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "tnb:recent-searches:v1";
const MAX_ITEMS = 10;

function parse(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return [];
  }
}

function writeStorage(items: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // localStorage が使えない環境では無視
  }
}

// useSyncExternalStore の getSnapshot は参照同一性を要求するため
// raw 文字列をキャッシュキーにして同一内容なら同じ array 参照を返す
let cachedRaw: string | null = null;
let cachedItems: readonly string[] = [];

function getSnapshot(): readonly string[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedItems;
  cachedRaw = raw;
  cachedItems = parse(raw);
  return cachedItems;
}

type Listener = () => void;
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) listener();
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

export type RecentSearches = {
  items: readonly string[];
  add(q: string): void;
  remove(q: string): void;
  clear(): void;
};

export function useRecentSearches(): RecentSearches {
  const items = useSyncExternalStore(subscribe, getSnapshot, () => []);

  const add = useCallback((q: string) => {
    const trimmed = q.trim();
    // 空文字 / 空白だけは無視
    if (!trimmed) return;
    const current = getSnapshot();
    // 重複は古いほうを削除して先頭に追加し、長さ 10 にトリム
    const next = [trimmed, ...Array.from(current).filter((v) => v !== trimmed)].slice(0, MAX_ITEMS);
    writeStorage(next);
    // キャッシュを無効化して次の getSnapshot で再読み込みさせる
    cachedRaw = null;
    notify();
  }, []);

  const remove = useCallback((q: string) => {
    const current = getSnapshot();
    writeStorage(Array.from(current).filter((v) => v !== q));
    cachedRaw = null;
    notify();
  }, []);

  const clear = useCallback(() => {
    writeStorage([]);
    cachedRaw = null;
    notify();
  }, []);

  return { items, add, remove, clear };
}
