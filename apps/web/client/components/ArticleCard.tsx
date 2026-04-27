import { useEffect, useRef, useState } from "react";
import { useReadState } from "../hooks/useReadState";
import { useStarredState } from "../hooks/useStarredState";
import type { Article, FeedCategory } from "../types/api";
import { highlight } from "../utils/highlight";
import { BookmarkButton } from "./BookmarkButton";
import { ShareButtons } from "./ShareButtons";

interface Props {
  article: Article;
  isSelected?: boolean;
  onFilterByCategory: (c: FeedCategory) => void;
  onFilterByFeedId: (id: string) => void;
  onNavigateToAuthor?: (author: string) => void;
  q?: string;
}

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

export function ArticleCard({
  article,
  isSelected,
  onFilterByCategory,
  onFilterByFeedId,
  onNavigateToAuthor,
  q = "",
}: Props) {
  const { isRead, markRead, markUnread } = useReadState();
  const { isStarred, toggleStar } = useStarredState();
  const [hovered, setHovered] = useState(false);
  const read = isRead(article.id);
  const starred = isStarred(article.id);
  const ref = useRef<HTMLElement>(null);

  // 選択されたカードをスクロールして表示する
  useEffect(() => {
    if (isSelected && ref.current) {
      ref.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [isSelected]);

  return (
    <article
      ref={ref}
      className={`article-card${read ? " read" : ""}${isSelected ? " is-selected" : ""}`}
      data-article-id={article.id}
      tabIndex={-1}
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
          {highlight(article.title, q)}
        </a>
        <button
          type="button"
          className="star-button"
          onClick={() => toggleStar(article.id)}
          aria-label={starred ? "スターを外す" : "スターを付ける"}
          aria-pressed={starred}
        >
          {starred ? "★" : "☆"}
        </button>
        <BookmarkButton guid={article.guid} />
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
          <span aria-hidden="true" style={{ marginRight: "3px" }}>
            {CATEGORY_ICON[article.category] ?? ""}
          </span>
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
            {onNavigateToAuthor ? (
              <button
                type="button"
                className="author-name author-name-clickable"
                onClick={() => {
                  if (article.author) onNavigateToAuthor(article.author);
                }}
                title={`${article.author} の記事一覧`}
              >
                {article.author}
              </button>
            ) : (
              <span className="author-name">{article.author}</span>
            )}
          </>
        )}
      </div>
      {article.summary && <p className="summary">{highlight(article.summary, q)}</p>}
      <ShareButtons url={article.url} title={article.title} />
    </article>
  );
}
