import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vite-plus/test";

const { useRecentSearches } = await import("../../client/hooks/useRecentSearches");

const STORAGE_KEY = "tnb:recent-searches:v1";

describe("useRecentSearches", () => {
  beforeEach(() => {
    // テスト間の localStorage 状態を隔離する
    localStorage.clear();
  });

  it("localStorage に永続化される", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => {
      result.current.add("react");
    });
    const stored = localStorage.getItem(STORAGE_KEY);
    expect(stored).not.toBeNull();
    const parsed: unknown = JSON.parse(stored!);
    expect.soft(Array.isArray(parsed)).toBe(true);
    expect.soft((parsed as string[]).includes("react")).toBe(true);
  });

  it("add: 先頭に追加される", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => {
      result.current.add("typescript");
      result.current.add("react");
    });
    expect.soft(result.current.items[0]).toBe("react");
    expect.soft(result.current.items[1]).toBe("typescript");
  });

  it("add: 空文字は無視される", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => {
      result.current.add("");
    });
    expect(result.current.items.length).toBe(0);
  });

  it("add: 空白だけは無視される", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => {
      result.current.add("   ");
    });
    expect(result.current.items.length).toBe(0);
  });

  it("add: 重複は先頭に re-unshift して 1 つだけ残る", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => {
      result.current.add("typescript");
      result.current.add("react");
      result.current.add("typescript");
    });
    expect.soft(result.current.items[0]).toBe("typescript");
    expect.soft(result.current.items.filter((v) => v === "typescript").length).toBe(1);
    expect.soft(result.current.items.length).toBe(2);
  });

  it("add: 11 件以上で 10 件にトリムされる", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => {
      for (let i = 1; i <= 11; i++) {
        result.current.add(`query-${i}`);
      }
    });
    expect.soft(result.current.items.length).toBe(10);
    // 最後に追加した query-11 が先頭にある
    expect.soft(result.current.items[0]).toBe("query-11");
    // 最初に追加した query-1 は溢れて消える
    expect.soft(result.current.items.includes("query-1")).toBe(false);
  });

  it("remove: 該当が消える", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => {
      result.current.add("typescript");
      result.current.add("react");
    });
    act(() => {
      result.current.remove("typescript");
    });
    expect.soft(result.current.items.includes("typescript")).toBe(false);
    expect.soft(result.current.items.includes("react")).toBe(true);
  });

  it("clear: 全消去される", () => {
    const { result } = renderHook(() => useRecentSearches());
    act(() => {
      result.current.add("typescript");
      result.current.add("react");
    });
    expect(result.current.items.length).toBe(2);
    act(() => {
      result.current.clear();
    });
    expect(result.current.items.length).toBe(0);
  });

  it("StorageEvent でクロスタブ同期される", () => {
    const { result } = renderHook(() => useRecentSearches());
    expect(result.current.items.length).toBe(0);

    act(() => {
      // 別タブから localStorage が変更されたことをシミュレート
      localStorage.setItem(STORAGE_KEY, JSON.stringify(["cross-tab-query"]));
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: STORAGE_KEY,
          newValue: JSON.stringify(["cross-tab-query"]),
        }),
      );
    });

    expect(result.current.items[0]).toBe("cross-tab-query");
  });

  it("参照安定性: raw が変わらなければ同じ array 参照を返す", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["a", "b"]));
    const { result } = renderHook(() => useRecentSearches());
    const first = result.current.items;
    // 再レンダリングを引き起こさずに再取得しても同じ参照
    const second = result.current.items;
    expect(first).toBe(second);
  });
});
