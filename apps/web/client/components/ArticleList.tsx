import type { Article } from "../types/api";
import { ArticleCard } from "./ArticleCard";

interface Props {
  articles: Article[];
}

export function ArticleList({ articles }: Props) {
  return (
    <div className="article-list">
      {articles.map((a) => (
        <ArticleCard key={a.id} article={a} />
      ))}
    </div>
  );
}
