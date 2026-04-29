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

// カテゴリバッジの色: CSS custom properties を任意プロパティ記法で参照
const CATEGORY_BADGE_CLASS: Record<string, string> = {
  bigtech: "bg-[var(--cat-bigtech-bg)] text-[var(--cat-bigtech)]",
  ai: "bg-[var(--cat-ai-bg)] text-[var(--cat-ai)]",
  jp: "bg-[var(--cat-jp-bg)] text-[var(--cat-jp)]",
  zenn: "bg-[var(--cat-zenn-bg)] text-[var(--cat-zenn)]",
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

  const catBadgeClass =
    CATEGORY_BADGE_CLASS[article.category] ?? "bg-[var(--accent-soft)] text-[var(--accent)]";

  return (
    <article
      ref={ref}
      className={`grid gap-[var(--space-2)] p-[var(--space-4)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] transition-[border-color,box-shadow,transform] duration-200 hover:border-[var(--accent)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2${read ? " opacity-55 hover:opacity-80" : ""}${isSelected ? " border-[var(--accent)] bg-[var(--accent-soft)] outline-2 outline-[var(--accent)] outline-offset-2" : ""}`}
      data-article-id={article.id}
      tabIndex={-1}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* カードヘッダ行 (タイトル + アクションボタン) */}
      <div className="flex items-start gap-[var(--space-2)]">
        <a
          href={safeHref(article.url)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-[var(--font-size-md)] font-semibold leading-[var(--line-height-tight)] text-[var(--fg-primary)] transition-colors duration-100 hover:text-[var(--accent)] hover:underline"
          onClick={() => markRead(article.id)}
        >
          {highlight(article.title, q)}
        </a>
        <button
          type="button"
          className="shrink-0 px-[var(--space-1)] py-0.5 bg-transparent text-[var(--fg-muted)] border-none text-[1rem] font-[inherit] cursor-pointer leading-none opacity-45 transition-[opacity,color] duration-100 hover:opacity-100 hover:text-[#d29922] aria-pressed:opacity-100 aria-pressed:text-[#d29922] focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 focus-visible:rounded-[var(--radius-sm)]"
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
            className="shrink-0 px-[var(--space-2)] py-0.5 bg-[var(--bg-overlay)] text-[var(--fg-muted)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] text-[var(--font-size-xs)] font-[inherit] cursor-pointer whitespace-nowrap opacity-75 transition-[opacity,border-color,color] duration-100 hover:opacity-100 hover:text-[var(--fg-primary)] hover:border-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
            onClick={() => (read ? markUnread(article.id) : markRead(article.id))}
          >
            {read ? "未読に戻す" : "既読にする"}
          </button>
        )}
      </div>
      {/* メタ行 */}
      <div className="flex flex-wrap items-center gap-[var(--space-2)] text-[var(--fg-muted)] text-[var(--font-size-sm)]">
        <button
          type="button"
          className={`inline-flex items-center px-[var(--space-2)] py-0.5 rounded-full text-[var(--font-size-xs)] font-semibold uppercase tracking-[0.04em] border-none font-[inherit] leading-[var(--line-height-tight)] whitespace-nowrap align-middle cursor-pointer transition-[opacity,filter] duration-100 hover:brightness-110 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 ${catBadgeClass}`}
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
          className="text-[var(--fg-primary)] font-medium border-none bg-transparent font-[inherit] text-inherit p-0 cursor-pointer transition-colors duration-100 hover:text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 focus-visible:rounded-[var(--radius-sm)]"
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
                className="text-[var(--fg-muted)] border-none bg-transparent font-[inherit] text-inherit p-0 cursor-pointer transition-colors duration-100 hover:text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
                onClick={() => {
                  if (article.author) onNavigateToAuthor(article.author);
                }}
                title={`${article.author} の記事一覧`}
              >
                {article.author}
              </button>
            ) : (
              <span className="text-[var(--fg-muted)]">{article.author}</span>
            )}
          </>
        )}
      </div>
      {article.summary && (
        <p className="text-[var(--fg-secondary)] text-[var(--font-size-sm)] leading-[var(--line-height-relaxed)] mt-0.5 mb-0 [-webkit-line-clamp:3] [display:-webkit-box] [-webkit-box-orient:vertical] overflow-hidden">
          {highlight(article.summary, q)}
        </p>
      )}
      <ShareButtons url={article.url} title={article.title} />
    </article>
  );
}
