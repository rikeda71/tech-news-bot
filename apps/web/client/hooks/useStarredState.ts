import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "tnb-starred-articles";
const MAX_IDS = 1000;

function parse(raw: string | null): Set<number> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is number => typeof v === "number"));
  } catch {
    return new Set();
  }
}

function writeStorage(ids: number[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage が使えない環境では無視
  }
}

// useSyncExternalStore の getSnapshot は参照同一性を要求するため
// raw 文字列をキャッシュキーにして同一内容なら同じ Set 参照を返す
let cachedRaw: string | null = null;
let cachedSet: Set<number> = new Set();

function getSnapshot(): Set<number> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedSet;
  cachedRaw = raw;
  cachedSet = parse(raw);
  return cachedSet;
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

export interface StarredStateAPI {
  isStarred: (id: number) => boolean;
  toggleStar: (id: number) => void;
}

export function useStarredState(): StarredStateAPI {
  const starredSet = useSyncExternalStore(subscribe, getSnapshot, () => new Set<number>());

  const isStarred = useCallback((id: number) => starredSet.has(id), [starredSet]);

  const toggleStar = useCallback((id: number) => {
    const current = getSnapshot();
    if (current.has(id)) {
      writeStorage(Array.from(current).filter((v) => v !== id));
    } else {
      // 新規追加は先頭に、LRU 1000 件超過分は破棄
      writeStorage([id, ...Array.from(current).filter((v) => v !== id)].slice(0, MAX_IDS));
    }
    // キャッシュを無効化して次の getSnapshot で再読み込みさせる
    cachedRaw = null;
    notify();
  }, []);

  return { isStarred, toggleStar };
}
