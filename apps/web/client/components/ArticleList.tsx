import type { Article, FeedCategory } from "../types/api";
import { ArticleCard } from "./ArticleCard";

interface Props {
  articles: Article[];
  onFilterByCategory: (c: FeedCategory) => void;
  onFilterByFeedId: (id: string) => void;
}

export function ArticleList({ articles, onFilterByCategory, onFilterByFeedId }: Props) {
  return (
    <div className="article-list">
      {articles.map((a) => (
        <ArticleCard
          key={a.id}
          article={a}
          onFilterByCategory={onFilterByCategory}
          onFilterByFeedId={onFilterByFeedId}
        />
      ))}
    </div>
  );
}
