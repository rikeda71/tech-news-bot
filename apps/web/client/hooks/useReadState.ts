import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "tnb-read-articles";
const MAX_IDS = 1000;

// localStorage から既読 id 配列を読む (新しい順に保存)
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

function getSnapshot(): number[] {
  return readStorage();
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
  const readIds = useSyncExternalStore(subscribe, getSnapshot, () => []);

  const isRead = useCallback((id: number) => readIds.includes(id), [readIds]);

  const markRead = useCallback((id: number) => {
    const current = readStorage();
    // すでに既読なら先頭に移動して更新 (LRU の定義通り)
    const without = current.filter((v) => v !== id);
    const next = [id, ...without].slice(0, MAX_IDS);
    writeStorage(next);
    notify();
  }, []);

  const markUnread = useCallback((id: number) => {
    const current = readStorage();
    const next = current.filter((v) => v !== id);
    writeStorage(next);
    notify();
  }, []);

  const clearAll = useCallback(() => {
    writeStorage([]);
    notify();
  }, []);

  return { isRead, markRead, markUnread, clearAll };
}
