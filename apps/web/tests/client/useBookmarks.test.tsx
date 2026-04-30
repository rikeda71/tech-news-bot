import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

const { useBookmarks } = await import("../../client/hooks/useBookmarks");

const STORAGE_KEY = "tnb:bookmarks:v1";

describe("useBookmarks", () => {
  beforeEach(() => {
    // テスト間の localStorage 状態を隔離する
    localStorage.clear();
  });

  it("initially returns an empty bookmarks set", () => {
    const { result } = renderHook(() => useBookmarks());
    expect(result.current.isBookmarked("guid-1")).toBe(false);
    expect(result.current.bookmarks.size).toBe(0);
  });

  it("toggle adds an article to bookmarks", () => {
    const { result } = renderHook(() => useBookmarks());
    act(() => {
      result.current.toggle("guid-abc");
    });
    expect(result.current.isBookmarked("guid-abc")).toBe(true);
  });

  it("toggle removes an already bookmarked article", () => {
    const { result } = renderHook(() => useBookmarks());
    act(() => {
      result.current.toggle("guid-abc");
    });
    expect(result.current.isBookmarked("guid-abc")).toBe(true);
    act(() => {
      result.current.toggle("guid-abc");
    });
    expect(result.current.isBookmarked("guid-abc")).toBe(false);
  });

  it("persists bookmarks to localStorage", () => {
    const { result } = renderHook(() => useBookmarks());
    act(() => {
      result.current.toggle("guid-xyz");
    });
    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed: unknown = JSON.parse(stored!);
    expect.soft(Array.isArray(parsed)).toBe(true);
    expect.soft((parsed as string[]).includes("guid-xyz")).toBe(true);
  });

  it("isBookmarked returns false for unknown guid", () => {
    const { result } = renderHook(() => useBookmarks());
    expect(result.current.isBookmarked("unknown-guid")).toBe(false);
  });

  it("clear() removes all bookmarks", () => {
    const { result } = renderHook(() => useBookmarks());
    act(() => {
      result.current.toggle("guid-1");
      result.current.toggle("guid-2");
    });
    expect(result.current.bookmarks.size).toBe(2);
    act(() => {
      result.current.clear();
    });
    expect.soft(result.current.bookmarks.size).toBe(0);
    expect.soft(result.current.isBookmarked("guid-1")).toBe(false);
    expect.soft(result.current.isBookmarked("guid-2")).toBe(false);
  });

  it("returns the same Set reference when raw is unchanged", () => {
    // raw が変わっていなければ getSnapshot が同じ参照を返すことを確認する
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["guid-a", "guid-b"]));
    const { result } = renderHook(() => useBookmarks());
    expect.soft(result.current.isBookmarked("guid-a")).toBe(true);
    expect.soft(result.current.isBookmarked("guid-b")).toBe(true);
    expect.soft(result.current.isBookmarked("guid-c")).toBe(false);
  });

  it("syncs via StorageEvent (cross-tab simulation)", () => {
    const { result } = renderHook(() => useBookmarks());
    expect(result.current.isBookmarked("guid-remote")).toBe(false);

    act(() => {
      // 別タブから localStorage が変更されたことをシミュレート
      localStorage.setItem(STORAGE_KEY, JSON.stringify(["guid-remote"]));
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: JSON.stringify(["guid-remote"]),
        }),
      );
    });

    expect(result.current.isBookmarked("guid-remote")).toBe(true);
  });
});
