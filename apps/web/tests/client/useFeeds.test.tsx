import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { FeedSummary } from "../../client/types/api";

const { useFeeds } = await import("../../client/hooks/useFeeds");

function makeFeed(id: string): FeedSummary {
  return {
    id,
    name: `Feed ${id}`,
    url: `https://example.com/feed/${id}`,
    category: "ai",
    lang: "en",
    enabled: true,
    articles_30d: 10,
    last_published_at: "2026-04-28T00:00:00Z",
  };
}

function makeResponse(feeds: FeedSummary[]) {
  return {
    ok: true,
    json: () => Promise.resolve({ feeds }),
  };
}

describe("useFeeds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetch 成功時にフィード一覧が返される", async () => {
    const feeds = [makeFeed("feed-1"), makeFeed("feed-2")];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse(feeds)));

    const { result } = renderHook(() => useFeeds());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.feeds).toHaveLength(2);
    expect(result.current.feeds[0]?.id).toBe("feed-1");
    expect(result.current.error).toBeNull();
  });

  it("fetch エラー時に error が設定されフィードは空", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    const { result } = renderHook(() => useFeeds());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain("500");
    expect(result.current.feeds).toEqual([]);
  });

  it("空のフィード一覧が返された場合、feeds は空配列", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeResponse([])));

    const { result } = renderHook(() => useFeeds());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.feeds).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("fetch 中は loading が true", async () => {
    let resolveFetch!: (v: unknown) => void;
    const fetchPromise = new Promise((r) => {
      resolveFetch = r;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(fetchPromise));

    const { result } = renderHook(() => useFeeds());

    expect(result.current.loading).toBe(true);

    resolveFetch(makeResponse([]));
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("ネットワーク例外発生時に error が設定される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network Error")));

    const { result } = renderHook(() => useFeeds());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network Error");
    expect(result.current.feeds).toEqual([]);
  });
});
