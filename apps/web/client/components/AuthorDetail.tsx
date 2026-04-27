import type { FeedCategory } from "../types/api";
import { useAuthorArticles } from "../hooks/useAuthorArticles";
import { ArticleCard } from "./ArticleCard";

interface Props {
  author: string;
  onBack: () => void;
  onFilterByCategory: (c: FeedCategory) => void;
  onFilterByFeedId: (id: string) => void;
}

/** 著者名の頭文字を取得する (日本語/英語両対応) */
function getInitial(name: string): string {
  if (!name) return "?";
  // Intl.Segmenter でグラフェムクラスタ単位に分割して最初の 1 文字を取得する
  const seg = new Intl.Segmenter();
  const first = seg.segment(name)[Symbol.iterator]().next().value?.segment ?? "?";
  return first.toUpperCase();
}

export function AuthorDetail({ author, onBack, onFilterByCategory, onFilterByFeedId }: Props) {
  const { articles, isLoading, error, hasMore, loadMore, loadingMore } = useAuthorArticles(author);

  return (
    <div className="author-detail">
      <div className="author-detail-header">
        <button type="button" className="back-button" onClick={onBack}>
          ← 一覧に戻る
        </button>

        {/* 著者プロファイルカード */}
        <div className="author-detail-profile">
          <div className="author-detail-avatar" aria-hidden="true">
            {getInitial(author)}
          </div>
          <div className="author-detail-info">
            <h1 className="author-detail-name">{author}</h1>
            {!isLoading && !error && (
              <span className="author-detail-count">{articles.length} 件の記事</span>
            )}
          </div>
        </div>
      </div>

      {isLoading && <div className="loader">読み込み中…</div>}
      {error && !isLoading && <div className="error">取得エラー: {error}</div>}
      {!isLoading && !error && articles.length === 0 && (
        <div className="empty">
          <span className="empty-icon">📭</span>
          <div className="empty-title">記事がありません</div>
        </div>
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
