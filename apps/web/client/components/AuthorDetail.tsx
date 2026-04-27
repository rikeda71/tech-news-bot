import type { FeedCategory } from "../types/api";
import { useAuthorArticles } from "../hooks/useAuthorArticles";
import { ArticleCard } from "./ArticleCard";

interface Props {
  author: string;
  onBack: () => void;
  onFilterByCategory: (c: FeedCategory) => void;
  onFilterByFeedId: (id: string) => void;
}

export function AuthorDetail({ author, onBack, onFilterByCategory, onFilterByFeedId }: Props) {
  const { articles, isLoading, error, hasMore, loadMore, loadingMore } = useAuthorArticles(author);

  return (
    <div className="author-detail">
      <div className="author-detail-header">
        <button type="button" className="back-button" onClick={onBack}>
          ← 一覧に戻る
        </button>
        <h1 className="author-detail-name">{author}</h1>
        {!isLoading && !error && <span className="author-detail-count">{articles.length} 件</span>}
      </div>

      {isLoading && <div className="loader">読み込み中…</div>}
      {error && !isLoading && <div className="error">取得エラー: {error}</div>}
      {!isLoading && !error && articles.length === 0 && (
        <div className="empty">記事がありません</div>
      )}

      {articles.length > 0 && (
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
      )}

      {hasMore && (
        <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "読み込み中…" : "もっと見る"}
        </button>
      )}
    </div>
  );
}
