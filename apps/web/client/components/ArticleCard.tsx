import { useState } from "react";
import { useReadState } from "../hooks/useReadState";
import type { Article, FeedCategory } from "../types/api";

interface Props {
  article: Article;
  onFilterByCategory: (c: FeedCategory) => void;
  onFilterByFeedId: (id: string) => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  bigtech: "Big Tech",
  ai: "AI",
  jp: "日本企業",
  zenn: "Zenn",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeHref(url: string): string {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:" ? url : "#";
  } catch {
    return "#";
  }
}

export function ArticleCard({ article, onFilterByCategory, onFilterByFeedId }: Props) {
  const { isRead, markRead, markUnread } = useReadState();
  const [hovered, setHovered] = useState(false);
  const read = isRead(article.id);

  return (
    <article
      className={`article-card${read ? " read" : ""}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="article-card-title-row">
        <a
          href={safeHref(article.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="title"
          onClick={() => markRead(article.id)}
        >
          {article.title}
        </a>
        {/* hover 時に既読 / 未読切り替えボタンを薄く表示 */}
        {hovered && (
          <button
            type="button"
            className="read-toggle"
            onClick={() => (read ? markUnread(article.id) : markRead(article.id))}
          >
            {read ? "未読に戻す" : "既読にする"}
          </button>
        )}
      </div>
      <div className="meta">
        <button
          type="button"
          className={`badge cat-${article.category} badge-clickable`}
          onClick={() => onFilterByCategory(article.category)}
          title={`${CATEGORY_LABEL[article.category] ?? article.category} で絞り込む`}
        >
          {CATEGORY_LABEL[article.category] ?? article.category}
        </button>
        <button
          type="button"
          className="feed-name feed-name-clickable"
          onClick={() => onFilterByFeedId(article.feed_id)}
          title={`${article.feed_name ?? article.feed_id} で絞り込む`}
        >
          {article.feed_name ?? article.feed_id}
        </button>
        <span>·</span>
        <time dateTime={article.published_at}>{formatDate(article.published_at)}</time>
        {article.author && (
          <>
            <span>·</span>
            <span>{article.author}</span>
          </>
        )}
      </div>
      {article.summary && <p className="summary">{article.summary}</p>}
    </article>
  );
}
