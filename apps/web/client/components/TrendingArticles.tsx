import type { FeedCategory } from "../types/api";
import type { TrendingDays } from "../hooks/usePopularArticles";
import { usePopularArticles } from "../hooks/usePopularArticles";
import { ArticleCard } from "./ArticleCard";

const DAYS_OPTIONS: TrendingDays[] = [7, 14, 30];

interface Props {
  onFilterByCategory: (c: FeedCategory) => void;
  onFilterByFeedId: (id: string) => void;
  onNavigateToAuthor?: (author: string) => void;
}

export function TrendingArticles({
  onFilterByCategory,
  onFilterByFeedId,
  onNavigateToAuthor,
}: Props) {
  const { articles, total, isLoading, error, days, setDays } = usePopularArticles(30);

  return (
    <div className="trending-page">
      <div className="trending-header">
        <h2 className="trending-title">🔥 トレンド</h2>
        <div className="trending-days-toggle" role="group" aria-label="期間切替">
          {DAYS_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              className={`trending-days-btn${days === d ? " active" : ""}`}
              aria-pressed={days === d}
              onClick={() => setDays(d)}
            >
              {d} 日
            </button>
          ))}
        </div>
      </div>

      {!isLoading && !error && total > 0 && <p className="trending-meta">{total} 件</p>}

      {isLoading && <div className="loader">読み込み中…</div>}

      {error && !isLoading && <div className="error">取得エラー: {error}</div>}

      {!isLoading && !error && articles.length === 0 && (
        <div className="empty">
          <span className="empty-icon">📭</span>
          <div className="empty-title">直近 {days} 日間の記事はまだありません</div>
          <div className="empty-body">Cron 実行後にトレンド記事が表示されます。</div>
        </div>
      )}

      {articles.length > 0 && (
        <div className="article-list">
          {articles.map((a, i) => (
            <div
              key={a.id}
              className={i === 0 ? "trending-article-highlight" : undefined}
              style={{ position: "relative" }}
            >
              {i === 0 && (
                <span className="trending-rank-badge" aria-label="1位">
                  1
                </span>
              )}
              <ArticleCard
                article={a}
                onFilterByCategory={onFilterByCategory}
                onFilterByFeedId={onFilterByFeedId}
                onNavigateToAuthor={onNavigateToAuthor}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
