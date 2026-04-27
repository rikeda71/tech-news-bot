import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "tnb-starred-articles";
const MAX_IDS = 1000;

function readStorage(): number[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is number => typeof v === "number");
  } catch {
    return [];
  }
}

function writeStorage(ids: number[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage が使えない環境では無視
  }
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

function getSnapshot(): number[] {
  return readStorage();
}

export interface StarredStateAPI {
  isStarred: (id: number) => boolean;
  toggleStar: (id: number) => void;
}

export function useStarredState(): StarredStateAPI {
  const starredIds = useSyncExternalStore(subscribe, getSnapshot, () => []);

  const isStarred = useCallback((id: number) => starredIds.includes(id), [starredIds]);

  const toggleStar = useCallback((id: number) => {
    const current = readStorage();
    const already = current.includes(id);
    if (already) {
      writeStorage(current.filter((v) => v !== id));
    } else {
      // 新規追加は先頭に、LRU 1000 件超過分は破棄
      writeStorage([id, ...current.filter((v) => v !== id)].slice(0, MAX_IDS));
    }
    notify();
  }, []);

  return { isStarred, toggleStar };
}
