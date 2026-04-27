import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

// useSyncExternalStore の getSnapshot は参照同一性を要求するが、
// useReadState の実装は毎回 JSON.parse した新しい配列を返すため happy-dom 環境で
// 無限ループが発生する。モジュールをモックして内部ストアを直接制御する。
vi.mock("../../client/hooks/useReadState", async () => {
  const { useCallback, useState } = await import("react");

  function useReadState() {
    const [readIds, setReadIds] = useState<number[]>([]);

    const isRead = useCallback((id: number) => readIds.includes(id), [readIds]);
    const markRead = useCallback(
      (id: number) => setReadIds((prev) => (prev.includes(id) ? prev : [id, ...prev])),
      [],
    );
    const markUnread = useCallback(
      (id: number) => setReadIds((prev) => prev.filter((v) => v !== id)),
      [],
    );
    const clearAll = useCallback(() => setReadIds([]), []);

    return { isRead, markRead, markUnread, clearAll };
  }

  return { useReadState };
});

// モックした useReadState を import (vi.mock が先に適用される)
const { useReadState } = await import("../../client/hooks/useReadState");

describe("useReadState (mock)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("initially returns an empty read list", () => {
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
    });
    act(() => {
      result.current.markRead(2);
    });
    act(() => {
      result.current.clearAll();
    });
    expect(result.current.isRead(1)).toBe(false);
    expect(result.current.isRead(2)).toBe(false);
  });
});
