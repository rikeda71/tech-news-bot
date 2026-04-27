import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Article } from "../../client/types/api";

const { ArticleCard } = await import("../../client/components/ArticleCard");

const baseArticle: Article = {
  id: 1,
  guid: "guid-1",
  feed_id: "feed-a",
  feed_name: "Feed A",
  title: "Sample Article Title",
  url: "https://example.com/article",
  summary: "A short summary.",
  author: "Author",
  published_at: "2024-01-01T00:00:00Z",
  fetched_at: "2024-01-01T01:00:00Z",
  category: "ai",
  lang: "en",
};

const noop = () => {};

describe("ArticleCard", () => {
  beforeEach(() => {
    // テスト間の localStorage 状態を隔離する
    localStorage.clear();
  });

  it("renders the article title", () => {
    render(<ArticleCard article={baseArticle} onFilterByCategory={noop} onFilterByFeedId={noop} />);
    expect(screen.getByText("Sample Article Title")).toBeTruthy();
  });

  it("applies read class when isRead returns true", () => {
    // localStorage に id=1 を既読として設定してから描画する
    localStorage.setItem("tnb-read-articles", JSON.stringify([1]));
    const { container } = render(
      <ArticleCard article={baseArticle} onFilterByCategory={noop} onFilterByFeedId={noop} />,
    );
    const article = container.querySelector("article");
    expect(article?.className).toContain("read");
  });

  it("does not apply read class for unread article", () => {
    const unreadArticle = { ...baseArticle, id: 99 };
    const { container } = render(
      <ArticleCard article={unreadArticle} onFilterByCategory={noop} onFilterByFeedId={noop} />,
    );
    const article = container.querySelector("article");
    expect(article?.className).not.toContain("read");
  });

  it("renders the category badge", () => {
    render(<ArticleCard article={baseArticle} onFilterByCategory={noop} onFilterByFeedId={noop} />);
    expect(screen.getByText("AI")).toBeTruthy();
  });

  it("calls onFilterByCategory when category badge is clicked", async () => {
    const onFilterByCategory = vi.fn<(c: string) => void>();
    const user = userEvent.setup();
    render(
      <ArticleCard
        article={baseArticle}
        onFilterByCategory={onFilterByCategory}
        onFilterByFeedId={noop}
      />,
    );
    await user.click(screen.getByText("AI"));
    expect(onFilterByCategory).toHaveBeenCalledWith("ai");
  });
});
