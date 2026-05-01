import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Article } from "../../client/types/api";

const { useArticles } = await import("../../client/hooks/useArticles");

function makeArticle(id: number): Article {
  return {
    id,
    guid: `guid-${id}`,
    feed_id: "test-feed",
    feed_name: "Test Feed",
    title: `Article ${id}`,
    url: `https://example.com/article/${id}`,
    summary: `Summary ${id}`,
    author: "Author",
    published_at: "2024-01-15T10:00:00Z",
    fetched_at: "2024-01-15T11:00:00Z",
    category: "ai",
    lang: "en",
  };
}

function makeResponse(articles: Article[], nextCursor: string | null = null) {
  return {
    ok: true,
    json: () => Promise.resolve({ articles, nextCursor }),
  };
}

// renderHook 内で毎回 {} を渡すと新規オブジェクトになり query の依存が変化し続けるため定数を使う
const EMPTY_QUERY = {};
const NO_FILTER = { filteredLength: 0, isFilterActive: false };

describe("useArticles 基本動作", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetch 成功時に記事が返される", async () => {
    const articles = Array.from({ length: 5 }, (_, i) => makeArticle(i + 1));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(articles)));

    const { result } = renderHook(() => useArticles(EMPTY_QUERY, NO_FILTER));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect.soft(result.current.articles).toHaveLength(5);
    expect.soft(result.current.error).toBeNull();
  });

  it("nextCursor が null のとき nextCursor が null になる", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse([makeArticle(1)], null)));

    const { result } = renderHook(() => useArticles(EMPTY_QUERY, NO_FILTER));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.nextCursor).toBeNull();
  });

  it("fetch エラー時に error が設定される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { result } = renderHook(() => useArticles(EMPTY_QUERY, NO_FILTER));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect.soft(result.current.error).toBeTruthy();
    expect.soft(result.current.articles).toEqual([]);
  });

  it("loadMore で次ページが追加される", async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeArticle(i + 1));
    const page2 = Array.from({ length: 5 }, (_, i) => makeArticle(i + 21));
    const mockFetch = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(makeResponse(page1, "cursor-next") as unknown as Response)
      .mockResolvedValueOnce(makeResponse(page2, null) as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() =>
      useArticles(EMPTY_QUERY, { filteredLength: 20, isFilterActive: false }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.articles).toHaveLength(20);

    await act(async () => {
      await result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.articles).toHaveLength(25);
    });

    expect(result.current.nextCursor).toBeNull();
  });
});

describe("useArticles 自動 loadMore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("isFilterActive=false のとき自動 loadMore は発火しない", async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeArticle(i + 1));
    const mockFetch = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(makeResponse(page1, "cursor-next") as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    // filteredLength < MIN_VISIBLE(10) だがフィルタは OFF
    const { result } = renderHook(() =>
      useArticles(EMPTY_QUERY, { filteredLength: 3, isFilterActive: false }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // 自動 loadMore が発火しないため fetch は初回の 1 回のみ
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("フィルタ ON で filteredLength >= MIN_VISIBLE のとき自動 loadMore は発火しない", async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeArticle(i + 1));
    const mockFetch = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(makeResponse(page1, "cursor-next") as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    // filteredLength=10 (=MIN_VISIBLE) で閾値以上のため発火しない
    const { result } = renderHook(() =>
      useArticles(EMPTY_QUERY, { filteredLength: 10, isFilterActive: true }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("hasMore=false のとき自動 loadMore は発火しない", async () => {
    const page1 = Array.from({ length: 5 }, (_, i) => makeArticle(i + 1));
    const mockFetch = vi
      .fn<() => Promise<Response>>()
      // nextCursor=null なので hasMore=false
      .mockResolvedValue(makeResponse(page1, null) as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() =>
      useArticles(EMPTY_QUERY, { filteredLength: 2, isFilterActive: true }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // nextCursor=null なので自動発火はしない
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("フィルタ ON で filteredLength < MIN_VISIBLE かつ nextCursor がある場合に自動 loadMore が発火する", async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeArticle(i + 1));
    const page2 = Array.from({ length: 20 }, (_, i) => makeArticle(i + 21));
    const mockFetch = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(makeResponse(page1, "cursor-2") as unknown as Response)
      .mockResolvedValue(makeResponse(page2, null) as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    // filteredLength=2 で MIN_VISIBLE(10) 未満 → 自動発火を期待
    const { result } = renderHook(() =>
      useArticles(EMPTY_QUERY, { filteredLength: 2, isFilterActive: true }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // 自動 loadMore が発火し fetch が 2 回以上呼ばれるまで待つ
    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    await waitFor(() => {
      expect(result.current.articles).toHaveLength(40);
    });
  });

  it("AUTO_LOAD_MAX (5回) に達すると自動 loadMore が停止する", async () => {
    // 毎回 nextCursor を返し続けるレスポンスで上限に当たることを確認する
    const mockFetch = vi.fn<() => Promise<Response>>().mockResolvedValue(
      makeResponse(
        Array.from({ length: 20 }, (_, i) => makeArticle(i + 1)),
        "cursor-next",
      ) as unknown as Response,
    );
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() =>
      useArticles(EMPTY_QUERY, { filteredLength: 2, isFilterActive: true }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // 初回 + 最大 5 回の自動 loadMore = 合計 6 回で頭打ちになるまで待つ
    await waitFor(
      () => {
        expect(result.current.autoLoadCount).toBe(5);
      },
      { timeout: 3000 },
    );

    // 上限到達後に autoLoadStopped が true になる
    expect.soft(result.current.autoLoadStopped).toBe(true);
    // これ以上 fetch が呼ばれないことを確認 (=6 回で打ち止め)
    expect.soft(mockFetch.mock.calls.length).toBe(6);
  });

  it("autoLoadStopped は isFilterActive=false のとき false のまま", async () => {
    const mockFetch = vi.fn<() => Promise<Response>>().mockResolvedValue(
      makeResponse(
        Array.from({ length: 5 }, (_, i) => makeArticle(i + 1)),
        "cursor-next",
      ) as unknown as Response,
    );
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() =>
      useArticles(EMPTY_QUERY, { filteredLength: 2, isFilterActive: false }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.autoLoadStopped).toBe(false);
  });
});
