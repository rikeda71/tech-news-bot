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

function makeFeedMetaResponse() {
  return {
    ok: true,
    json: () => Promise.resolve(baseFeedResponse),
  };
}

function makeArticlesResponse(articles: Article[], nextCursor: string | null = null) {
  return {
    ok: true,
    json: () => Promise.resolve({ articles, nextCursor }),
  };
}

describe("FeedDetail", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("ローディング中は読み込み中テキストを表示する", () => {
    // fetch を pending のままにして loading 状態を維持する
    vi.stubGlobal("fetch", vi.fn<() => Promise<Response>>().mockReturnValue(new Promise(() => {})));
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
    // 1 回目: /api/feeds/:id (feed meta), 2 回目: /api/articles/by-feed/:id
    vi.stubGlobal(
      "fetch",
      vi
        .fn<() => Promise<Response>>()
        .mockResolvedValueOnce(makeFeedMetaResponse() as unknown as Response)
        .mockResolvedValueOnce(makeArticlesResponse([]) as unknown as Response),
    );

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

    expect.soft(screen.getByText("https://example.com/feed")).toBeTruthy();
    expect.soft(screen.getByText("42")).toBeTruthy();
  });

  it("記事 5 件の場合に 5 枚のカードが表示される", async () => {
    const articles = Array.from({ length: 5 }, (_, i) => makeArticle(i + 1));
    vi.stubGlobal(
      "fetch",
      vi
        .fn<() => Promise<Response>>()
        .mockResolvedValueOnce(makeFeedMetaResponse() as unknown as Response)
        .mockResolvedValueOnce(makeArticlesResponse(articles) as unknown as Response),
    );

    render(
      <FeedDetail
        feedId="test-feed"
        onBack={() => {}}
        onFilterByFeedId={() => {}}
        onFilterByCategory={() => {}}
      />,
    );

    // フィード名は h2 として表示されるため role で絞り込む
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Test Feed" })).toBeTruthy();
    });

    for (let i = 1; i <= 5; i++) {
      expect(screen.getByText(`Article ${i}`)).toBeTruthy();
    }
  });

  it("記事 0 件のとき空状態メッセージを表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<() => Promise<Response>>()
        .mockResolvedValueOnce(makeFeedMetaResponse() as unknown as Response)
        .mockResolvedValueOnce(makeArticlesResponse([]) as unknown as Response),
    );

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
    vi.stubGlobal(
      "fetch",
      vi.fn<() => Promise<Response>>().mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as unknown as Response),
    );

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
    vi.stubGlobal(
      "fetch",
      vi
        .fn<() => Promise<Response>>()
        .mockResolvedValueOnce(makeFeedMetaResponse() as unknown as Response)
        .mockResolvedValueOnce(makeArticlesResponse([]) as unknown as Response),
    );

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
      expect(screen.getByRole("heading", { name: "Test Feed" })).toBeTruthy();
    });

    const backButton = screen.getByText("← 一覧に戻る");
    const user = userEvent.setup();
    await user.click(backButton);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("「もっと見る」ボタンクリックで次ページが追加表示される", async () => {
    const page1 = Array.from({ length: 20 }, (_, i) => makeArticle(i + 1));
    const page2 = Array.from({ length: 5 }, (_, i) => makeArticle(i + 21));

    vi.stubGlobal(
      "fetch",
      vi
        .fn<() => Promise<Response>>()
        .mockResolvedValueOnce(makeFeedMetaResponse() as unknown as Response)
        .mockResolvedValueOnce(makeArticlesResponse(page1, "cursor-next") as unknown as Response)
        .mockResolvedValueOnce(makeArticlesResponse(page2, null) as unknown as Response),
    );

    const user = userEvent.setup();
    render(
      <FeedDetail
        feedId="test-feed"
        onBack={() => {}}
        onFilterByFeedId={() => {}}
        onFilterByCategory={() => {}}
      />,
    );

    // フィードメタが表示されるまで待つ
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Test Feed" })).toBeTruthy();
    });

    // 初期 20 件が表示される
    await waitFor(() => {
      expect(screen.getByText("Article 1")).toBeTruthy();
      expect(screen.getByText("Article 20")).toBeTruthy();
    });

    // 「もっと見る」ボタンが表示される
    const loadMoreBtn = await screen.findByRole("button", { name: /もっと見る/ });
    expect(loadMoreBtn).toBeTruthy();

    // クリックで次ページが追加される
    await user.click(loadMoreBtn);

    await waitFor(() => {
      expect(screen.getByText("Article 25")).toBeTruthy();
    });

    // nextCursor=null で「もっと見る」ボタンが消える
    expect(screen.queryByRole("button", { name: /もっと見る/ })).toBeNull();
  });

  it("hasMore=false (nextCursor=null) のとき「もっと見る」ボタンが表示されない", async () => {
    const articles = Array.from({ length: 5 }, (_, i) => makeArticle(i + 1));
    vi.stubGlobal(
      "fetch",
      vi
        .fn<() => Promise<Response>>()
        .mockResolvedValueOnce(makeFeedMetaResponse() as unknown as Response)
        .mockResolvedValueOnce(makeArticlesResponse(articles, null) as unknown as Response),
    );

    render(
      <FeedDetail
        feedId="test-feed"
        onBack={() => {}}
        onFilterByFeedId={() => {}}
        onFilterByCategory={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Article 5")).toBeTruthy();
    });

    expect(screen.queryByRole("button", { name: /もっと見る/ })).toBeNull();
  });

  it("feedId が変わると再 fetch する", async () => {
    const feedMeta2 = {
      ...baseFeedResponse,
      feed: { ...baseFeedResponse.feed, id: "other-feed", name: "Other Feed" },
    };

    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(makeFeedMetaResponse() as unknown as Response)
      .mockResolvedValueOnce(makeArticlesResponse([]) as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(feedMeta2),
      } as unknown as Response)
      .mockResolvedValueOnce(makeArticlesResponse([]) as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <FeedDetail
        feedId="test-feed"
        onBack={() => {}}
        onFilterByFeedId={() => {}}
        onFilterByCategory={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Test Feed" })).toBeTruthy();
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
      expect(screen.getByRole("heading", { name: "Other Feed" })).toBeTruthy();
    });

    // feed meta と articles で各 2 回ずつ、計 4 回 fetch
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/feeds/test-feed?recent=20");
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("/api/articles/by-feed/test-feed"),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(3, "/api/feeds/other-feed?recent=20");
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining("/api/articles/by-feed/other-feed"),
    );
  });
});
