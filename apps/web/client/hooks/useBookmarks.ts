import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "tnb:bookmarks:v1";
const MAX_IDS = 1000;

function parse(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((v): v is string => typeof v === "string"));
  } catch {
    return new Set();
  }
}

function writeStorage(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // localStorage が使えない環境では無視
  }
}

// useSyncExternalStore の getSnapshot は参照同一性を要求するため
// raw 文字列をキャッシュキーにして同一内容なら同じ Set 参照を返す
let cachedRaw: string | null = null;
let cachedSet: ReadonlySet<string> = new Set();

function getSnapshot(): ReadonlySet<string> {
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

export interface BookmarksAPI {
  bookmarks: ReadonlySet<string>;
  isBookmarked: (guid: string) => boolean;
  toggle: (guid: string) => void;
  clear: () => void;
}

export function useBookmarks(): BookmarksAPI {
  const bookmarks = useSyncExternalStore(subscribe, getSnapshot, () => new Set<string>());

  const isBookmarked = useCallback((guid: string) => bookmarks.has(guid), [bookmarks]);

  const toggle = useCallback((guid: string) => {
    const current = getSnapshot();
    if (current.has(guid)) {
      writeStorage(Array.from(current).filter((v) => v !== guid));
    } else {
      // 新規追加は先頭に、上限超過分は破棄
      writeStorage([guid, ...Array.from(current).filter((v) => v !== guid)].slice(0, MAX_IDS));
    }
    // キャッシュを無効化して次の getSnapshot で再読み込みさせる
    cachedRaw = null;
    notify();
  }, []);

  const clear = useCallback(() => {
    writeStorage([]);
    cachedRaw = null;
    notify();
  }, []);

  return { bookmarks, isBookmarked, toggle, clear };
}
