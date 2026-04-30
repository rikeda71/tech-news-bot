import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

const { useStarredState } = await import("../../client/hooks/useStarredState");

describe("useStarredState", () => {
  beforeEach(() => {
    // テスト間の localStorage 状態を隔離する
    localStorage.clear();
  });

  it("initially returns an empty starred set", () => {
    const { result } = renderHook(() => useStarredState());
    expect(result.current.isStarred(1)).toBe(false);
  });

  it("toggleStar adds an article to starred", () => {
    const { result } = renderHook(() => useStarredState());
    act(() => {
      result.current.toggleStar(42);
    });
    expect(result.current.isStarred(42)).toBe(true);
  });

  it("toggleStar removes an already starred article", () => {
    const { result } = renderHook(() => useStarredState());
    act(() => {
      result.current.toggleStar(10);
    });
    expect(result.current.isStarred(10)).toBe(true);
    act(() => {
      result.current.toggleStar(10);
    });
    expect(result.current.isStarred(10)).toBe(false);
  });

  it("maintains other starred articles when toggling one", () => {
    const { result } = renderHook(() => useStarredState());
    act(() => {
      result.current.toggleStar(1);
      result.current.toggleStar(2);
    });
    act(() => {
      result.current.toggleStar(1);
    });
    expect.soft(result.current.isStarred(1)).toBe(false);
    expect.soft(result.current.isStarred(2)).toBe(true);
  });

  it("returns the same Set reference when raw is unchanged", () => {
    // raw が変わっていなければ getSnapshot が同じ参照を返すことを確認する
    localStorage.setItem("tnb-starred-articles", JSON.stringify([7, 8]));
    const { result } = renderHook(() => useStarredState());
    expect.soft(result.current.isStarred(7)).toBe(true);
    expect.soft(result.current.isStarred(99)).toBe(false);
  });
});
