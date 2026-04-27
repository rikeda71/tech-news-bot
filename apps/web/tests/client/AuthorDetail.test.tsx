import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Article } from "../../client/types/api";

const { AuthorDetail } = await import("../../client/components/AuthorDetail");

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 1,
    guid: "guid-1",
    feed_id: "feed-a",
    feed_name: "Feed A",
    title: "Test Article",
    url: "https://example.com/article",
    summary: "A short summary.",
    author: "Author A",
    published_at: "2024-01-01T00:00:00Z",
    fetched_at: "2024-01-01T01:00:00Z",
    category: "ai",
    lang: "en",
    ...overrides,
  };
}

function makeArticlesResponse(articles: Article[], nextCursor: string | null = null) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        articles,
        nextCursor,
      }),
  };
}

const noop = () => {};

describe("AuthorDetail", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ローディング表示", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(
      <AuthorDetail
        author="Author A"
        onBack={noop}
        onFilterByCategory={noop}
        onFilterByFeedId={noop}
      />,
    );
    expect(screen.getByText(/読み込み中/)).toBeTruthy();
  });

  it("著者名と記事カード 5 件が描画される", async () => {
    const articles = Array.from({ length: 5 }, (_, i) =>
      makeArticle({ id: i + 1, guid: `guid-${i + 1}`, title: `記事 ${i + 1}` }),
    );
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeArticlesResponse(articles)));
    render(
      <AuthorDetail
        author="Author A"
        onBack={noop}
        onFilterByCategory={noop}
        onFilterByFeedId={noop}
      />,
    );
    // h1 に著者名
    expect(screen.getByRole("heading", { level: 1, name: "Author A" })).toBeTruthy();
    // 記事タイトルが全て表示される
    for (let i = 1; i <= 5; i++) {
      expect(await screen.findByText(`記事 ${i}`)).toBeTruthy();
    }
    // 件数表示
    expect(screen.getByText(/5 件/)).toBeTruthy();
  });

  it("0 件で「記事がありません」が表示される", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeArticlesResponse([])));
    render(
      <AuthorDetail
        author="Author A"
        onBack={noop}
        onFilterByCategory={noop}
        onFilterByFeedId={noop}
      />,
    );
    const empty = await screen.findByText("記事がありません");
    expect(empty).toBeTruthy();
  });

  it("エラー (500) 時にエラーメッセージを表示する", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    render(
      <AuthorDetail
        author="Author A"
        onBack={noop}
        onFilterByCategory={noop}
        onFilterByFeedId={noop}
      />,
    );
    const err = await screen.findByText(/取得エラー/);
    expect(err).toBeTruthy();
  });

  it("「← 一覧に戻る」ボタン click で onBack が呼ばれる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<() => Promise<unknown>>().mockResolvedValue(makeArticlesResponse([])),
    );
    const onBack = vi.fn<() => void>();
    const user = userEvent.setup();
    render(
      <AuthorDetail
        author="Author A"
        onBack={onBack}
        onFilterByCategory={noop}
        onFilterByFeedId={noop}
      />,
    );
    // ボタンが出るまで待つ
    const backBtn = screen.getByRole("button", { name: /一覧に戻る/ });
    await user.click(backBtn);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("fetch の URL に著者名が URL エンコードされて含まれる", async () => {
    const mockFetch = vi.fn<() => Promise<unknown>>().mockResolvedValue(makeArticlesResponse([]));
    vi.stubGlobal("fetch", mockFetch);
    render(
      <AuthorDetail
        author="Author A"
        onBack={noop}
        onFilterByCategory={noop}
        onFilterByFeedId={noop}
      />,
    );
    await screen.findByText("記事がありません");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/articles/by-author/Author%20A"),
    );
  });
});
