import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Article } from "../../client/types/api";

const { TrendingArticles } = await import("../../client/components/TrendingArticles");

function makeArticle(id: number): Article {
  return {
    id,
    guid: `guid-${id}`,
    feed_id: "test-feed",
    feed_name: "Test Feed",
    title: `Article ${id}`,
    url: `https://example.com/article/${id}`,
    summary: null,
    author: null,
    published_at: "2024-01-15T10:00:00Z",
    fetched_at: "2024-01-15T11:00:00Z",
    category: "ai",
    lang: "en",
  };
}

function makePopularResponse(articles: Article[]) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        articles,
        window_days: 7,
        total: articles.length,
      }),
  };
}

const noop = () => {};

describe("TrendingArticles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("ローディング中は読み込み中テキストを表示する", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<TrendingArticles onFilterByCategory={noop} onFilterByFeedId={noop} />);
    expect(screen.getByText("読み込み中…")).toBeTruthy();
  });

  it("記事一覧を表示する", async () => {
    const articles = Array.from({ length: 3 }, (_, i) => makeArticle(i + 1));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makePopularResponse(articles)));

    render(<TrendingArticles onFilterByCategory={noop} onFilterByFeedId={noop} />);

    await waitFor(() => {
      expect(screen.getByText("Article 1")).toBeTruthy();
    });

    expect(screen.getByText("Article 2")).toBeTruthy();
    expect(screen.getByText("Article 3")).toBeTruthy();
  });

  it("0 件のとき empty state を表示する", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makePopularResponse([])));

    render(<TrendingArticles onFilterByCategory={noop} onFilterByFeedId={noop} />);

    await waitFor(() => {
      expect(screen.getByText(/直近.*日間の記事はまだありません/)).toBeTruthy();
    });
  });

  it("エラー時にエラーメッセージを表示する", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));

    render(<TrendingArticles onFilterByCategory={noop} onFilterByFeedId={noop} />);

    await waitFor(() => {
      expect(screen.getByText(/取得エラー/)).toBeTruthy();
    });
  });

  it("期間 toggle ボタンが 3 つ表示される (7 日 / 14 日 / 30 日)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makePopularResponse([])));

    render(<TrendingArticles onFilterByCategory={noop} onFilterByFeedId={noop} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "7 日" })).toBeTruthy();
    });

    expect(screen.getByRole("button", { name: "14 日" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "30 日" })).toBeTruthy();
  });

  it("7 日ボタンはデフォルトで aria-pressed=true", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makePopularResponse([])));

    render(<TrendingArticles onFilterByCategory={noop} onFilterByFeedId={noop} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "7 日" })).toBeTruthy();
    });

    const btn7 = screen.getByRole("button", { name: "7 日" });
    expect(btn7.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "14 日" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
  });

  it("14 日ボタンをクリックすると aria-pressed=true に変わる", async () => {
    const mockFetch = vi.fn<() => Promise<unknown>>().mockResolvedValue(makePopularResponse([]));
    vi.stubGlobal("fetch", mockFetch);

    const user = userEvent.setup();
    render(<TrendingArticles onFilterByCategory={noop} onFilterByFeedId={noop} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "14 日" })).toBeTruthy();
    });

    await user.click(screen.getByRole("button", { name: "14 日" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "14 日" }).getAttribute("aria-pressed")).toBe(
        "true",
      );
    });
  });

  it("件数を表示する", async () => {
    const articles = Array.from({ length: 5 }, (_, i) => makeArticle(i + 1));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makePopularResponse(articles)));

    render(<TrendingArticles onFilterByCategory={noop} onFilterByFeedId={noop} />);

    await waitFor(() => {
      expect(screen.getByText("5 件")).toBeTruthy();
    });
  });
});
