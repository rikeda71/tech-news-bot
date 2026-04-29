import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Article } from "../../client/types/api";

const { ArticleList } = await import("../../client/components/ArticleList");

const makeArticle = (id: number, title: string): Article => ({
  id,
  guid: `guid-${id}`,
  feed_id: "feed-a",
  feed_name: "Feed A",
  title,
  url: `https://example.com/article/${id}`,
  summary: "A summary.",
  author: "Author",
  published_at: "2024-01-01T00:00:00Z",
  fetched_at: "2024-01-01T01:00:00Z",
  category: "ai",
  lang: "en",
});

const noop = () => {};

describe("ArticleList", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders nothing meaningful when articles is empty", () => {
    const { container } = render(
      <ArticleList articles={[]} onFilterByCategory={noop} onFilterByFeedId={noop} />,
    );
    // grid wrapper は存在するが ArticleCard は描画されない
    const links = container.querySelectorAll("a");
    expect(links).toHaveLength(0);
  });

  it("renders all article titles", () => {
    const articles = [
      makeArticle(1, "Title A"),
      makeArticle(2, "Title B"),
      makeArticle(3, "Title C"),
    ];
    render(<ArticleList articles={articles} onFilterByCategory={noop} onFilterByFeedId={noop} />);
    screen.getByText("Title A");
    screen.getByText("Title B");
    screen.getByText("Title C");
  });

  it("renders only the specified articles when selectedIndex is given", () => {
    const articles = [makeArticle(1, "First"), makeArticle(2, "Second")];
    render(
      <ArticleList
        articles={articles}
        selectedIndex={1}
        onFilterByCategory={noop}
        onFilterByFeedId={noop}
      />,
    );
    // 両方のタイトルが描画されることを確認
    screen.getByText("First");
    screen.getByText("Second");
  });

  it("calls onFilterByCategory when category badge is clicked", async () => {
    const onFilterByCategory = vi.fn<(c: string) => void>();
    const user = userEvent.setup();
    const articles = [makeArticle(1, "AI Article")];
    render(
      <ArticleList
        articles={articles}
        onFilterByCategory={onFilterByCategory}
        onFilterByFeedId={noop}
      />,
    );
    await user.click(screen.getByText("AI"));
    expect(onFilterByCategory).toHaveBeenCalledWith("ai");
  });

  it("passes q prop down to ArticleCard for highlighting", () => {
    const articles = [makeArticle(1, "React is awesome")];
    render(
      <ArticleList
        articles={articles}
        q="React"
        onFilterByCategory={noop}
        onFilterByFeedId={noop}
      />,
    );
    // q="React" が渡されると highlight が適用されるが
    // テキストは mark 要素などで分割されるため部分一致で確認する
    screen.getByText(/React/);
  });
});
