import { useFeedDetail } from "../hooks/useFeedDetail";
import type { FeedCategory } from "../types/api";
import { ArticleCard } from "./ArticleCard";

const CATEGORY_LABEL: Record<string, string> = {
  bigtech: "Big Tech",
  ai: "AI",
  jp: "日本企業",
  zenn: "Zenn",
};

interface Props {
  feedId: string;
  onBack: () => void;
  onFilterByFeedId: (id: string) => void;
  onFilterByCategory: (c: FeedCategory) => void;
}

export function FeedDetail({ feedId, onBack, onFilterByFeedId, onFilterByCategory }: Props) {
  const { feed, articles, isLoading, error } = useFeedDetail(feedId);

  if (isLoading) {
    return <div className="loader">読み込み中…</div>;
  }

  if (error === "feed_not_found") {
    return (
      <div className="feed-detail">
        <button type="button" className="feed-detail-back" onClick={onBack}>
          ← 一覧に戻る
        </button>
        <div className="error">フィードが見つかりません</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="feed-detail">
        <button type="button" className="feed-detail-back" onClick={onBack}>
          ← 一覧に戻る
        </button>
        <div className="error">取得エラー: {error}</div>
      </div>
    );
  }

  if (!feed) return null;

  return (
    <div className="feed-detail">
      <button type="button" className="feed-detail-back" onClick={onBack}>
        ← 一覧に戻る
      </button>

      <section className="feed-detail-info">
        <h2 className="feed-detail-name">{feed.name}</h2>
        <div className="feed-detail-meta">
          <a href={feed.url} target="_blank" rel="noopener noreferrer" className="feed-detail-url">
            {feed.url}
          </a>
          <span className={`badge cat-${feed.category}`}>
            {CATEGORY_LABEL[feed.category] ?? feed.category}
          </span>
          <span className="feed-detail-lang">{feed.lang.toUpperCase()}</span>
        </div>
        <div className="feed-detail-stats">
          <span className="feed-detail-stat-label">30 日の記事数:</span>
          <span className="feed-detail-stat-value">{feed.articles_30d}</span>
        </div>
      </section>

      <section className="feed-detail-articles">
        <h3 className="feed-detail-articles-title">直近の記事</h3>
        {articles.length === 0 ? (
          <div className="empty">記事がありません</div>
        ) : (
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
      </section>
    </div>
  );
}
