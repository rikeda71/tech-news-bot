import type { Article, FeedCategory } from "../types/api";
import { ArticleCard } from "./ArticleCard";

interface Props {
  articles: Article[];
  focusedId?: number | null;
  onFilterByCategory: (c: FeedCategory) => void;
  onFilterByFeedId: (id: string) => void;
}

export function ArticleList({ articles, focusedId, onFilterByCategory, onFilterByFeedId }: Props) {
  return (
    <div className="article-list">
      {articles.map((a) => (
        <ArticleCard
          key={a.id}
          article={a}
          focused={focusedId === a.id}
          onFilterByCategory={onFilterByCategory}
          onFilterByFeedId={onFilterByFeedId}
        />
      ))}
    </div>
  );
}
