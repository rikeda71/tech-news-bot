import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Article } from "../../client/types/api";

const { useFeedArticles } = await import("../../client/hooks/useFeedArticles");

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

function makeArticlesResponse(articles: Article[], nextCursor: string | null = null) {
  return {
    ok: true,
    json: () => Promise.resolve({ articles, nextCursor }),
  };
}

describe("useFeedArticles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("初期状態でローディングが true になる", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { result } = renderHook(() => useFeedArticles("test-feed"));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.articles).toEqual([]);
  });

  it("fetch 成功時に記事が返される", async () => {
    const articles = Array.from({ length: 5 }, (_, i) => makeArticle(i + 1));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeArticlesResponse(articles)));

    const { result } = renderHook(() => useFeedArticles("test-feed"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.articles).toHaveLength(5);
    expect(result.current.error).toBeNull();
  });

  it("nextCursor が null のとき hasMore が false になる", async () => {
    const articles = [makeArticle(1)];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeArticlesResponse(articles, null)));

    const { result } = renderHook(() => useFeedArticles("test-feed"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hasMore).toBe(false);
  });

  it("nextCursor がある場合 hasMore が true になる", async () => {
    const articles = Array.from({ length: 20 }, (_, i) => makeArticle(i + 1));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeArticlesResponse(articles, "cursor-abc")));

    const { result } = renderHook(() => useFeedArticles("test-feed"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.hasMore).toBe(true);
  });

  it("fetch URL に feedId が含まれる", async () => {
    const mockFetch = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValue(makeArticlesResponse([]) as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => useFeedArticles("my-feed-id"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/articles/by-feed/my-feed-id"),
    );
  });

  it("loadMore で次ページが追加される", async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeArticle(i + 1));
    const page2 = Array.from({ length: 10 }, (_, i) => makeArticle(i + 21));

    const mockFetch = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(makeArticlesResponse(page1, "cursor-next") as unknown as Response)
      .mockResolvedValueOnce(makeArticlesResponse(page2, null) as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => useFeedArticles("test-feed"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.articles).toHaveLength(20);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.articles).toHaveLength(30);
    });

    expect(result.current.hasMore).toBe(false);
  });

  it("loadMore の URL に cursor が含まれる", async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeArticle(i + 1));
    const mockFetch = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(makeArticlesResponse(page1, "cursor-xyz") as unknown as Response)
      .mockResolvedValueOnce(makeArticlesResponse([], null) as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => useFeedArticles("test-feed"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.loadingMore).toBe(false);
    });

    expect(mockFetch).toHaveBeenNthCalledWith(2, expect.stringContaining("cursor=cursor-xyz"));
  });

  it("fetch エラー時に error が設定される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { result } = renderHook(() => useFeedArticles("test-feed"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.articles).toEqual([]);
  });
});
