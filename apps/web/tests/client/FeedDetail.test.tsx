import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Article, FeedDetailResponse } from "../../client/types/api";

// dynamic import で ESM の副作用（localStorage アクセス等）を各テスト前に初期化する
const { FeedDetail } = await import("../../client/components/FeedDetail");

const baseFeedResponse: FeedDetailResponse = {
  feed: {
    id: "test-feed",
    name: "Test Feed",
    url: "https://example.com/feed",
    category: "ai",
    lang: "en",
    enabled: true,
    articles_30d: 42,
    last_published_at: "2024-01-15T10:00:00Z",
  },
  recent_articles: [],
};

const makeArticle = (id: number): Article => ({
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
});

describe("FeedDetail", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("ローディング中は読み込み中テキストを表示する", () => {
    // fetch を pending のままにして loading 状態を維持する
    globalThis.fetch = vi.fn<() => Promise<Response>>(() => new Promise(() => {}));
    render(
      <FeedDetail
        feedId="test-feed"
        onBack={() => {}}
        onFilterByFeedId={() => {}}
        onFilterByCategory={() => {}}
      />,
    );
    expect(screen.getByText("読み込み中…")).toBeTruthy();
  });

  it("フィード名・URL・articles_30d を表示する", async () => {
    globalThis.fetch = vi.fn<() => Promise<Response>>().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(baseFeedResponse),
    } as unknown as Response);

    render(
      <FeedDetail
        feedId="test-feed"
        onBack={() => {}}
        onFilterByFeedId={() => {}}
        onFilterByCategory={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Test Feed")).toBeTruthy();
    });

    expect(screen.getByText("https://example.com/feed")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("記事 5 件の場合に 5 枚のカードが表示される", async () => {
    const articles = Array.from({ length: 5 }, (_, i) => makeArticle(i + 1));
    globalThis.fetch = vi.fn<() => Promise<Response>>().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ...baseFeedResponse, recent_articles: articles }),
    } as unknown as Response);

    render(
      <FeedDetail
        feedId="test-feed"
        onBack={() => {}}
        onFilterByFeedId={() => {}}
        onFilterByCategory={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Test Feed")).toBeTruthy();
    });

    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(`Article ${i}`)).toBeTruthy();
    }
  });

  it("記事 0 件のとき空状態メッセージを表示する", async () => {
    globalThis.fetch = vi.fn<() => Promise<Response>>().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ ...baseFeedResponse, recent_articles: [] }),
    } as unknown as Response);

    render(
      <FeedDetail
        feedId="test-feed"
        onBack={() => {}}
        onFilterByFeedId={() => {}}
        onFilterByCategory={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("記事がありません")).toBeTruthy();
    });
  });

  it("404 エラーのとき「フィードが見つかりません」を表示する", async () => {
    globalThis.fetch = vi.fn<() => Promise<Response>>().mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as unknown as Response);

    render(
      <FeedDetail
        feedId="unknown-feed"
        onBack={() => {}}
        onFilterByFeedId={() => {}}
        onFilterByCategory={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("フィードが見つかりません")).toBeTruthy();
    });
  });

  it("「← 一覧に戻る」ボタンクリックで onBack が呼ばれる", async () => {
    globalThis.fetch = vi.fn<() => Promise<Response>>().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(baseFeedResponse),
    } as unknown as Response);

    const onBack = vi.fn<() => void>();
    render(
      <FeedDetail
        feedId="test-feed"
        onBack={onBack}
        onFilterByFeedId={() => {}}
        onFilterByCategory={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Test Feed")).toBeTruthy();
    });

    const backButton = screen.getByText("← 一覧に戻る");
    const user = userEvent.setup();
    await user.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("feedId が変わると再 fetch する", async () => {
    const fetchMock = vi.fn<() => Promise<Response>>();
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(baseFeedResponse),
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ...baseFeedResponse,
            feed: { ...baseFeedResponse.feed, id: "other-feed", name: "Other Feed" },
          }),
      } as unknown as Response);
    globalThis.fetch = fetchMock;

    const { rerender } = render(
      <FeedDetail
        feedId="test-feed"
        onBack={() => {}}
        onFilterByFeedId={() => {}}
        onFilterByCategory={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Test Feed")).toBeTruthy();
    });

    rerender(
      <FeedDetail
        feedId="other-feed"
        onBack={() => {}}
        onFilterByFeedId={() => {}}
        onFilterByCategory={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Other Feed")).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/feeds/test-feed?recent=20");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/feeds/other-feed?recent=20");
  });
});
