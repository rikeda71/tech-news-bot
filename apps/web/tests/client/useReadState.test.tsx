import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

const { useReadState } = await import("../../client/hooks/useReadState");

describe("useReadState", () => {
  beforeEach(() => {
    // テスト間の localStorage 状態を隔離する
    localStorage.clear();
  });

  it("initially returns an empty read set", () => {
    const { result } = renderHook(() => useReadState());
    expect(result.current.isRead(1)).toBe(false);
  });

  it("marks an article as read", () => {
    const { result } = renderHook(() => useReadState());
    act(() => {
      result.current.markRead(42);
    });
    expect(result.current.isRead(42)).toBe(true);
  });

  it("unmarks a read article", () => {
    const { result } = renderHook(() => useReadState());
    act(() => {
      result.current.markRead(10);
    });
    expect(result.current.isRead(10)).toBe(true);
    act(() => {
      result.current.markUnread(10);
    });
    expect(result.current.isRead(10)).toBe(false);
  });

  it("clears all read articles", () => {
    const { result } = renderHook(() => useReadState());
    act(() => {
      result.current.markRead(1);
      result.current.markRead(2);
    });
    act(() => {
      result.current.clearAll();
    });
    expect.soft(result.current.isRead(1)).toBe(false);
    expect.soft(result.current.isRead(2)).toBe(false);
  });

  it("returns the same Set reference when raw is unchanged", () => {
    // raw が変わっていなければ getSnapshot が同じ参照を返すことを確認する
    localStorage.setItem("tnb-read-articles", JSON.stringify([5, 6]));
    const { result } = renderHook(() => useReadState());
    expect.soft(result.current.isRead(5)).toBe(true);
    expect.soft(result.current.isRead(99)).toBe(false);
  });
});
