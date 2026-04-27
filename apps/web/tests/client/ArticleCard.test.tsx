import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Article } from "../../client/types/api";

// ArticleCard は useReadState / useStarredState (useSyncExternalStore ベース) を内部で使っている。
// happy-dom 環境では getSnapshot の参照安定性問題で無限ループになるため
// 両 hook をモックして ArticleCard の描画ロジックに集中する。
vi.mock("../../client/hooks/useReadState", () => ({
  useReadState: () => ({
    isRead: (id: number) => id === 1,
    markRead: vi.fn<(id: number) => void>(),
    markUnread: vi.fn<(id: number) => void>(),
    clearAll: vi.fn<() => void>(),
  }),
}));

vi.mock("../../client/hooks/useStarredState", () => ({
  useStarredState: () => ({
    isStarred: vi.fn<(id: number) => boolean>().mockReturnValue(false),
    toggleStar: vi.fn<(id: number) => void>(),
    clearAll: vi.fn<() => void>(),
  }),
}));

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
  it("renders the article title", () => {
    render(<ArticleCard article={baseArticle} onFilterByCategory={noop} onFilterByFeedId={noop} />);
    expect(screen.getByText("Sample Article Title")).toBeTruthy();
  });

  it("applies read class when isRead returns true", () => {
    // モックで id=1 は既読として返す
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
