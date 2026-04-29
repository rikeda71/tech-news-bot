import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Article } from "../../client/types/api";

const { useAuthorArticles } = await import("../../client/hooks/useAuthorArticles");

function makeArticle(id: number): Article {
  return {
    id,
    guid: `guid-${id}`,
    feed_id: "test-feed",
    feed_name: "Test Feed",
    title: `Article ${id}`,
    url: `https://example.com/a/${id}`,
    summary: null,
    author: "Test Author",
    published_at: "2026-04-28T10:00:00Z",
    fetched_at: "2026-04-28T11:00:00Z",
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

describe("useAuthorArticles", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetch 成功時に著者の記事一覧が返される", async () => {
    const articles = [makeArticle(1), makeArticle(2)];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(articles)));

    const { result } = renderHook(() => useAuthorArticles("Test Author"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.articles).toHaveLength(2);
    expect(result.current.error).toBeNull();
    expect(result.current.hasMore).toBe(false);
  });

  it("fetch エラー時に error が設定され記事は空", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { result } = renderHook(() => useAuthorArticles("Test Author"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toContain("500");
    expect(result.current.articles).toEqual([]);
  });

  it("author が変わると再 fetch が発火する", async () => {
    const mockFetch = vi.fn().mockResolvedValue(makeResponse([makeArticle(1)]));
    vi.stubGlobal("fetch", mockFetch);

    const { rerender } = renderHook(({ author }) => useAuthorArticles(author), {
      initialProps: { author: "Author A" },
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const firstCall = mockFetch.mock.calls[0] as [string, ...unknown[]];
    expect(firstCall[0]).toContain(encodeURIComponent("Author A"));

    rerender({ author: "Author B" });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const secondCall = mockFetch.mock.calls[1] as [string, ...unknown[]];
    expect(secondCall[0]).toContain(encodeURIComponent("Author B"));
  });

  it("loadMore で次ページが追加される", async () => {
    const page1 = [makeArticle(1), makeArticle(2)];
    const page2 = [makeArticle(3)];
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(makeResponse(page1, "cursor-next"))
      .mockResolvedValueOnce(makeResponse(page2, null));
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => useAuthorArticles("Test Author"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.articles).toHaveLength(2);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.articles).toHaveLength(3);
    });

    expect(result.current.hasMore).toBe(false);
  });

  it("author が空文字の場合は fetch が発火しない", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => useAuthorArticles(""));

    await act(async () => {});

    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.articles).toEqual([]);
  });
});
