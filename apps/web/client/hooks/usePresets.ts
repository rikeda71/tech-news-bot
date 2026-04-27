import { useCallback, useSyncExternalStore } from "react";
import type { FeedCategory, FeedLang } from "../types/api";

const STORAGE_KEY = "tnb-presets";
const MAX_PRESETS = 50;

export interface PresetFilters {
  category?: FeedCategory | "";
  lang?: FeedLang | "";
  feedId?: string;
  q?: string;
  unreadOnly?: boolean;
  starredOnly?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

export interface Preset {
  id: string;
  name: string;
  filters: PresetFilters;
}

function parse(raw: string | null): Preset[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is Preset =>
        typeof v === "object" &&
        v !== null &&
        typeof (v as Preset).id === "string" &&
        typeof (v as Preset).name === "string" &&
        typeof (v as Preset).filters === "object",
    );
  } catch {
    return [];
  }
}

function writeStorage(presets: Preset[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
  } catch {
    // localStorage が使えない環境では無視
  }
}

// useSyncExternalStore の getSnapshot は参照同一性を要求するため
// raw 文字列をキャッシュキーにして同一内容なら同じ参照を返す
let cachedRaw: string | null = null;
let cachedSnapshot: Preset[] = [];

function getSnapshot(): Preset[] {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === cachedRaw) return cachedSnapshot;
  cachedRaw = raw;
  cachedSnapshot = parse(raw);
  return cachedSnapshot;
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

export interface PresetsAPI {
  presets: Preset[];
  addPreset: (name: string, filters: PresetFilters) => void;
  removePreset: (id: string) => void;
}

export function usePresets(): PresetsAPI {
  const presets = useSyncExternalStore(subscribe, getSnapshot, () => []);

  const addPreset = useCallback((name: string, filters: PresetFilters) => {
    const current = getSnapshot();
    if (current.length >= MAX_PRESETS) {
      alert(`プリセットは最大 ${MAX_PRESETS} 件まで保存できます。不要なものを削除してください。`);
      return;
    }
    const next: Preset[] = [...current, { id: crypto.randomUUID(), name, filters }];
    writeStorage(next);
    // キャッシュを無効化して次の getSnapshot で再読み込みさせる
    cachedRaw = null;
    notify();
  }, []);

  const removePreset = useCallback((id: string) => {
    const current = getSnapshot();
    const next = current.filter((p) => p.id !== id);
    writeStorage(next);
    cachedRaw = null;
    notify();
  }, []);

  return { presets, addPreset, removePreset };
}
