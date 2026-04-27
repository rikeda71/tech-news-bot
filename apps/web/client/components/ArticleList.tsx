import type { Article, FeedCategory } from "../types/api";
import { ArticleCard } from "./ArticleCard";

interface Props {
  articles: Article[];
  selectedIndex?: number;
  onFilterByCategory: (c: FeedCategory) => void;
  onFilterByFeedId: (id: string) => void;
  onNavigateToAuthor?: (author: string) => void;
  q?: string;
}

export function ArticleList({
  articles,
  selectedIndex = -1,
  onFilterByCategory,
  onFilterByFeedId,
  onNavigateToAuthor,
  q,
}: Props) {
  return (
    <div className="article-list">
      {articles.map((a, i) => (
        <ArticleCard
          key={a.id}
          article={a}
          isSelected={i === selectedIndex}
          onFilterByCategory={onFilterByCategory}
          onFilterByFeedId={onFilterByFeedId}
          onNavigateToAuthor={onNavigateToAuthor}
          q={q}
        />
      ))}
    </div>
  );
}
