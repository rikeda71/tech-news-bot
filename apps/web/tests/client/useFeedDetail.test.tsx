import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { Article, FeedDetail } from "../../client/types/api";

const { useFeedDetail } = await import("../../client/hooks/useFeedDetail");

function makeFeedDetail(id: string): FeedDetail {
  return {
    id,
    name: `Feed ${id}`,
    url: `https://example.com/feed/${id}`,
    category: "ai",
    lang: "en",
    enabled: true,
    articles_30d: 20,
    last_published_at: "2026-04-28T00:00:00Z",
  };
}

function makeArticle(num: number): Article {
  return {
    id: num,
    guid: `guid-${num}`,
    feed_id: "feed-1",
    feed_name: "Feed 1",
    title: `Article ${num}`,
    url: `https://example.com/a/${num}`,
    summary: null,
    author: null,
    published_at: "2026-04-28T10:00:00Z",
    fetched_at: "2026-04-28T11:00:00Z",
    category: "ai",
    lang: "en",
  };
}

describe("useFeedDetail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetch 成功時にフィード詳細と記事一覧が返される", async () => {
    const feed = makeFeedDetail("feed-1");
    const articles = [makeArticle(1), makeArticle(2)];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ feed, recent_articles: articles }),
      }),
    );

    const { result } = renderHook(() => useFeedDetail("feed-1"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.feed?.id).toBe("feed-1");
    expect(result.current.articles).toHaveLength(2);
    expect(result.current.error).toBeNull();
  });

  it("404 エラー時に feed_not_found が設定される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    const { result } = renderHook(() => useFeedDetail("nonexistent"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("feed_not_found");
    expect(result.current.feed).toBeNull();
    expect(result.current.articles).toEqual([]);
  });

  it("500 エラー時に HTTP エラーメッセージが設定される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { result } = renderHook(() => useFeedDetail("feed-1"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("HTTP 500");
    expect(result.current.feed).toBeNull();
  });

  it("feedId が変わると再 fetch が発火する", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ feed: makeFeedDetail("feed-2"), recent_articles: [] }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const { rerender } = renderHook(({ id }) => useFeedDetail(id), {
      initialProps: { id: "feed-1" },
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    rerender({ id: "feed-2" });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const lastCall = mockFetch.mock.calls[1] as [string, ...unknown[]];
    expect(lastCall[0]).toContain("feed-2");
  });

  it("ネットワーク例外発生時に error が設定される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network failed")));

    const { result } = renderHook(() => useFeedDetail("feed-1"));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe("Network failed");
    expect(result.current.feed).toBeNull();
    expect(result.current.articles).toEqual([]);
  });
});
