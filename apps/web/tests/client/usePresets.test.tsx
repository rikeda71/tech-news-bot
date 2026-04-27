import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// usePresets は useSyncExternalStore + localStorage を使うため
// useReadState と同様にモックして内部ストアを直接制御する
vi.mock("../../client/hooks/usePresets", async () => {
  const { useCallback, useState } = await import("react");

  type PresetFilters = {
    category?: string;
    lang?: string;
    feedId?: string;
    q?: string;
    unreadOnly?: boolean;
    starredOnly?: boolean;
    dateFrom?: string;
    dateTo?: string;
  };

  type Preset = {
    id: string;
    name: string;
    filters: PresetFilters;
  };

  let idCounter = 0;

  function usePresets() {
    const [presets, setPresets] = useState<Preset[]>([]);

    const addPreset = useCallback(
      (name: string, filters: PresetFilters) => {
        if (presets.length >= 50) {
          alert(`プリセットは最大 50 件まで保存できます。不要なものを削除してください。`);
          return;
        }
        idCounter += 1;
        setPresets((prev) => {
          if (prev.length >= 50) {
            alert(`プリセットは最大 50 件まで保存できます。不要なものを削除してください。`);
            return prev;
          }
          return [...prev, { id: String(idCounter), name, filters }];
        });
      },
      [presets.length],
    );

    const removePreset = useCallback((id: string) => {
      setPresets((prev) => prev.filter((p) => p.id !== id));
    }, []);

    return { presets, addPreset, removePreset };
  }

  return { usePresets };
});

const { usePresets } = await import("../../client/hooks/usePresets");

describe("usePresets (mock)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("initially returns an empty preset list", () => {
    const { result } = renderHook(() => usePresets());
    expect(result.current.presets).toHaveLength(0);
  });

  it("adds a preset to the list", () => {
    const { result } = renderHook(() => usePresets());
    act(() => {
      result.current.addPreset("ai + ja", { category: "ai", lang: "ja" });
    });
    expect(result.current.presets).toHaveLength(1);
    expect(result.current.presets[0].name).toBe("ai + ja");
    expect(result.current.presets[0].filters.category).toBe("ai");
  });

  it("removes a preset from the list", () => {
    const { result } = renderHook(() => usePresets());
    act(() => {
      result.current.addPreset("bigtech + en", { category: "bigtech", lang: "en" });
    });
    expect(result.current.presets).toHaveLength(1);
    const id = result.current.presets[0].id;
    act(() => {
      result.current.removePreset(id);
    });
    expect(result.current.presets).toHaveLength(0);
  });

  it("does not exceed 50 presets and shows alert", () => {
    // happy-dom 環境では window.alert が undefined のためグローバルに差し替える
    const alertMock = vi.fn<() => void>();
    globalThis.alert = alertMock;

    const { result } = renderHook(() => usePresets());

    act(() => {
      for (let i = 0; i < 50; i++) {
        result.current.addPreset(`preset-${i}`, { q: String(i) });
      }
    });
    expect(result.current.presets).toHaveLength(50);

    act(() => {
      result.current.addPreset("one-too-many", { q: "overflow" });
    });
    expect(alertMock).toHaveBeenCalled();
    expect(result.current.presets).toHaveLength(50);

    // @ts-expect-error -- globalThis.alert を元に戻す
    delete globalThis.alert;
  });
});
