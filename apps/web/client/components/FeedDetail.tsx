import { useState } from "react";
import { useFeedArticles } from "../hooks/useFeedArticles";
import { useFeedDetail } from "../hooks/useFeedDetail";
import type { FeedCategory } from "../types/api";
import { ArticleCard } from "./ArticleCard";

const CATEGORY_LABEL: Record<string, string> = {
  bigtech: "Big Tech",
  ai: "AI",
  jp: "日本企業",
  zenn: "Zenn",
};

const CATEGORY_ICON: Record<string, string> = {
  bigtech: "🏢",
  ai: "🤖",
  jp: "🇯🇵",
  zenn: "📝",
};

interface Props {
  feedId: string;
  onBack: () => void;
  onFilterByFeedId: (id: string) => void;
  onFilterByCategory: (c: FeedCategory) => void;
}

/** フィード URL からドメインを抽出し Google favicon API URL を返す */
function getFaviconUrl(feedUrl: string): string {
  try {
    const domain = new URL(feedUrl).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return "";
  }
}

export function FeedDetail({ feedId, onBack, onFilterByFeedId, onFilterByCategory }: Props) {
  // feed メタ (name, url, category, lang, articles_30d) のみ useFeedDetail で取得
  const { feed, isLoading: metaLoading, error: metaError } = useFeedDetail(feedId);
  // 記事一覧は cursor pagination 対応の hook で管理
  const {
    articles,
    isLoading: articlesLoading,
    error: articlesError,
    hasMore,
    loadMore,
    loadingMore,
  } = useFeedArticles(feedId);

  const [faviconError, setFaviconError] = useState(false);

  const isLoading = metaLoading || articlesLoading;
  const error = metaError;

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

  const faviconUrl = getFaviconUrl(feed.url);

  return (
    <div className="feed-detail">
      <button type="button" className="feed-detail-back" onClick={onBack}>
        ← 一覧に戻る
      </button>

      <section className="feed-detail-info">
        <div className="feed-detail-header">
          {/* favicon または プレースホルダー */}
          {faviconUrl && !faviconError ? (
            <img
              src={faviconUrl}
              alt=""
              className="feed-detail-favicon"
              onError={() => setFaviconError(true)}
              aria-hidden="true"
            />
          ) : (
            <div className="feed-detail-favicon-placeholder" aria-hidden="true">
              {CATEGORY_ICON[feed.category] ?? "📰"}
            </div>
          )}
          <h2 className="feed-detail-name">{feed.name}</h2>
        </div>
        <div className="feed-detail-meta">
          <a href={feed.url} target="_blank" rel="noopener noreferrer" className="feed-detail-url">
            {feed.url}
          </a>
          <span className={`badge cat-${feed.category}`}>
            <span aria-hidden="true" style={{ marginRight: "3px" }}>
              {CATEGORY_ICON[feed.category] ?? ""}
            </span>
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
        {articlesError && <div className="error">取得エラー: {articlesError}</div>}
        {!articlesError && articles.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">📭</span>
            <div className="empty-title">記事がありません</div>
          </div>
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
        {hasMore && (
          <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "読み込み中…" : "もっと見る"}
          </button>
        )}
      </section>
    </div>
  );
}
