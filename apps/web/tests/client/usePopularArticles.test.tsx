import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Article } from "../../client/types/api";

const { usePopularArticles } = await import("../../client/hooks/usePopularArticles");

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

function makePopularResponse(articles: Article[], total?: number) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        articles,
        window_days: 7,
        total: total ?? articles.length,
      }),
  };
}

describe("usePopularArticles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // localStorage をクリアしてデフォルトの 7 日になるようにする
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("初期状態でローディングが true になる", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { result } = renderHook(() => usePopularArticles());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.articles).toEqual([]);
  });

  it("fetch 成功時に記事と total が返される", async () => {
    const articles = Array.from({ length: 5 }, (_, i) => makeArticle(i + 1));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makePopularResponse(articles, 5)));

    const { result } = renderHook(() => usePopularArticles());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.articles).toHaveLength(5);
    expect(result.current.total).toBe(5);
    expect(result.current.error).toBeNull();
  });

  it("デフォルトの days は 7", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makePopularResponse([])));

    const { result } = renderHook(() => usePopularArticles());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.days).toBe(7);
  });

  it("fetch URL に days と limit が含まれる", async () => {
    const mockFetch = vi
      .fn<(url: string) => Promise<Response>>()
      .mockResolvedValue(makePopularResponse([]) as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => usePopularArticles(20));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining("/api/articles/popular"));
    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("days=7");
    expect(calledUrl).toContain("limit=20");
  });

  it("fetch エラー時に error が設定される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { result } = renderHook(() => usePopularArticles());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeTruthy();
    expect(result.current.articles).toEqual([]);
  });

  it("setDays で days が変わると再 fetch される", async () => {
    const mockFetch = vi
      .fn<(url: string) => Promise<Response>>()
      .mockResolvedValue(makePopularResponse([]) as unknown as Response);
    vi.stubGlobal("fetch", mockFetch);

    const { result } = renderHook(() => usePopularArticles());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);

    result.current.setDays(14);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const secondUrl = mockFetch.mock.calls[1][0];
    expect(secondUrl).toContain("days=14");
  });

  it("setDays で選択した days が localStorage に保存される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makePopularResponse([])));

    const { result } = renderHook(() => usePopularArticles());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    result.current.setDays(30);

    expect(localStorage.getItem("tnb:trending:days")).toBe("30");
  });
});
