import type { Article } from "../types/api";

interface Props {
  article: Article;
}

const CATEGORY_LABEL: Record<string, string> = {
  bigtech: "Big Tech",
  ai: "AI",
  jp: "日本企業",
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

export function ArticleCard({ article }: Props) {
  return (
    <article className="article-card">
      <a href={safeHref(article.url)} target="_blank" rel="noopener noreferrer" className="title">
        {article.title}
      </a>
      <div className="meta">
        <span className={`badge cat-${article.category}`}>
          {CATEGORY_LABEL[article.category] ?? article.category}
        </span>
        <span className="feed-name">{article.feed_name ?? article.feed_id}</span>
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
