import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Article } from "../../client/types/api";

// dynamic import でモジュールキャッシュをリセットし、テスト間の副作用を防ぐ
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

  it("applies dim style when isRead returns true", () => {
    // localStorage に id=1 を既読として設定してから描画する
    localStorage.setItem("tnb-read-articles", JSON.stringify([1]));
    const { container } = render(
      <ArticleCard article={baseArticle} onFilterByCategory={noop} onFilterByFeedId={noop} />,
    );
    const article = container.querySelector("article");
    // Tailwind 移行で .read クラス → opacity-55 utility に変更
    expect(article?.className).toContain("opacity-55");
  });

  it("does not dim unread article", () => {
    const unreadArticle = { ...baseArticle, id: 99 };
    const { container } = render(
      <ArticleCard article={unreadArticle} onFilterByCategory={noop} onFilterByFeedId={noop} />,
    );
    const article = container.querySelector("article");
    expect(article?.className).not.toContain("opacity-55");
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

  describe("highlight", () => {
    it("wraps a matching query term in the title with mark element", () => {
      render(
        <ArticleCard
          article={{ ...baseArticle, title: "Hello World" }}
          q="World"
          onFilterByCategory={noop}
          onFilterByFeedId={noop}
        />,
      );
      const mark = document.querySelector("mark");
      expect(mark?.textContent).toBe("World");
    });

    it("is case-insensitive when highlighting the title", () => {
      render(
        <ArticleCard
          article={{ ...baseArticle, title: "Hello World" }}
          q="hello"
          onFilterByCategory={noop}
          onFilterByFeedId={noop}
        />,
      );
      const mark = document.querySelector("mark");
      expect(mark?.textContent).toBe("Hello");
    });

    it("renders plain title without mark when q is empty", () => {
      render(
        <ArticleCard
          article={{ ...baseArticle, title: "Hello World" }}
          q=""
          onFilterByCategory={noop}
          onFilterByFeedId={noop}
        />,
      );
      expect.soft(document.querySelector("mark")).toBeNull();
      expect.soft(screen.getByText("Hello World")).toBeTruthy();
    });

    it("escapes regex special characters in the query (e.g. C++)", () => {
      render(
        <ArticleCard
          article={{ ...baseArticle, title: "Use C++ today" }}
          q="C++"
          onFilterByCategory={noop}
          onFilterByFeedId={noop}
        />,
      );
      expect(document.querySelector("mark")?.textContent).toBe("C++");
    });

    it("wraps multiple matches in the title with mark elements", () => {
      render(
        <ArticleCard
          article={{ ...baseArticle, title: "foo bar foo" }}
          q="foo"
          onFilterByCategory={noop}
          onFilterByFeedId={noop}
        />,
      );
      expect(document.querySelectorAll("mark")).toHaveLength(2);
    });
  });
});
