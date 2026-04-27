import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "tnb-read-articles";
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

// useSyncExternalStore 用サブスクライバー管理
type Listener = () => void;
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);

  // 他タブからの storage event を受けてタブ間同期
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

export interface ReadStateAPI {
  /** 指定 id が既読かどうか */
  isRead: (id: number) => boolean;
  /** 既読にする (LRU 1000件超過分は古い順に破棄) */
  markRead: (id: number) => void;
  /** 未読に戻す */
  markUnread: (id: number) => void;
  /** 全件クリア */
  clearAll: () => void;
}

export function useReadState(): ReadStateAPI {
  const readSet = useSyncExternalStore(subscribe, getSnapshot, () => new Set<number>());

  const isRead = useCallback((id: number) => readSet.has(id), [readSet]);

  const markRead = useCallback((id: number) => {
    const current = getSnapshot();
    // すでに既読なら先頭に移動して更新 (LRU の定義通り)
    const arr = [id, ...Array.from(current).filter((v) => v !== id)].slice(0, MAX_IDS);
    writeStorage(arr);
    // キャッシュを無効化して次の getSnapshot で再読み込みさせる
    cachedRaw = null;
    notify();
  }, []);

  const markUnread = useCallback((id: number) => {
    const current = getSnapshot();
    const arr = Array.from(current).filter((v) => v !== id);
    writeStorage(arr);
    cachedRaw = null;
    notify();
  }, []);

  const clearAll = useCallback(() => {
    writeStorage([]);
    cachedRaw = null;
    notify();
  }, []);

  return { isRead, markRead, markUnread, clearAll };
}
