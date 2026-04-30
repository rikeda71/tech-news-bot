import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

const STORAGE_KEY = "tnb:theme";

// localStorage.clear() だけではモジュールキャッシュ (cachedRaw) が残るため、
// StorageEvent で STORAGE_KEY の変更を通知してキャッシュを無効化してからテストする
function resetThemeStorage() {
  localStorage.clear();
  // キャッシュ無効化を強制するために StorageEvent を dispatch する
  window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: null }));
}

const { useTheme } = await import("../../client/hooks/useTheme");

describe("useTheme", () => {
  beforeEach(() => {
    resetThemeStorage();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to system when localStorage has no value", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("system");
  });

  it("resolvedTheme is 'light' or 'dark' (never 'system') when theme is system", () => {
    const { result } = renderHook(() => useTheme());
    const resolved = result.current.resolvedTheme;
    expect(resolved === "light" || resolved === "dark").toBe(true);
  });

  it("reads stored theme from localStorage when setTheme was called", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("dark");
    });
    expect.soft(result.current.theme).toBe("dark");
    expect.soft(result.current.resolvedTheme).toBe("dark");
  });

  it("setTheme persists to localStorage", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("light");
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  it("setTheme updates theme state", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("dark");
    });
    expect(result.current.theme).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
  });

  it("setTheme('light') sets resolvedTheme to 'light'", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("light");
    });
    expect(result.current.resolvedTheme).toBe("light");
  });

  it("setTheme('system') sets theme to 'system'", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("dark");
    });
    expect(result.current.theme).toBe("dark");
    act(() => {
      result.current.setTheme("system");
    });
    expect.soft(result.current.theme).toBe("system");
    expect.soft(localStorage.getItem(STORAGE_KEY)).toBe("system");
  });

  it("applies data-theme attribute to html element", () => {
    const { result } = renderHook(() => useTheme());
    act(() => {
      result.current.setTheme("dark");
    });
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("syncs theme via StorageEvent (cross-tab simulation)", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.theme).toBe("system");
    act(() => {
      localStorage.setItem(STORAGE_KEY, "light");
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: "light" }));
    });
    expect(result.current.theme).toBe("light");
  });
});
