import { useState } from "react";
import { useFeedArticles } from "../hooks/useFeedArticles";
import { useFeedDetail } from "../hooks/useFeedDetail";
import type { FeedCategory } from "../types/api";
import { ArticleCard } from "./ArticleCard";

const CATEGORY_LABEL: Record<string, string> = {
  bigtech: "Big Tech",
  ai: "AI",
  jp: "日本企業",
  personal: "個人ブログ",
};

const CATEGORY_ICON: Record<string, string> = {
  bigtech: "🏢",
  ai: "🤖",
  jp: "🇯🇵",
  personal: "👤",
};

// カテゴリバッジの色: CSS custom properties を任意プロパティ記法で参照
const CATEGORY_BADGE_CLASS: Record<string, string> = {
  bigtech: "bg-[var(--cat-bigtech-bg)] text-[var(--cat-bigtech)]",
  ai: "bg-[var(--cat-ai-bg)] text-[var(--cat-ai)]",
  jp: "bg-[var(--cat-jp-bg)] text-[var(--cat-jp)]",
  personal: "bg-[var(--cat-personal-bg)] text-[var(--cat-personal)]",
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

// ローダー・エラー・空状態の共通クラス
const loaderClass =
  "text-center text-[var(--fg-muted)] py-[var(--space-8)] px-[var(--space-3)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-lg)] mt-[var(--space-4)] text-[var(--font-size-base)] leading-[var(--line-height-relaxed)]";
const errorClass =
  "text-center text-[var(--danger)] py-[var(--space-8)] px-[var(--space-3)] border border-[rgba(207,34,46,0.3)] rounded-[var(--radius-lg)] mt-[var(--space-4)] text-[var(--font-size-base)] leading-[var(--line-height-relaxed)] bg-[var(--danger-soft)]";
const backBtnClass =
  "inline-flex items-center gap-[var(--space-1)] bg-transparent border-none text-[var(--accent)] cursor-pointer text-[var(--font-size-sm)] font-[inherit] py-[var(--space-1)] px-0 mb-[var(--space-4)] transition-opacity duration-100 hover:underline hover:opacity-85 focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 focus-visible:rounded-[var(--radius-sm)]";

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
    return <div className={loaderClass}>読み込み中…</div>;
  }

  if (error === "feed_not_found") {
    return (
      <div className="py-[var(--space-2)]">
        <button type="button" className={backBtnClass} onClick={onBack}>
          ← 一覧に戻る
        </button>
        <div className={errorClass}>フィードが見つかりません</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-[var(--space-2)]">
        <button type="button" className={backBtnClass} onClick={onBack}>
          ← 一覧に戻る
        </button>
        <div className={errorClass}>取得エラー: {error}</div>
      </div>
    );
  }

  if (!feed) return null;

  const faviconUrl = getFaviconUrl(feed.url);
  const catBadgeClass =
    CATEGORY_BADGE_CLASS[feed.category] ?? "bg-[var(--accent-soft)] text-[var(--accent)]";

  return (
    <div className="py-[var(--space-2)]">
      <button type="button" className={backBtnClass} onClick={onBack}>
        ← 一覧に戻る
      </button>

      {/* フィードメタ情報 */}
      <section className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)] p-[var(--space-5)] mb-[var(--space-6)]">
        <div className="flex items-center gap-[var(--space-3)] mb-[var(--space-3)]">
          {/* favicon または プレースホルダー */}
          {faviconUrl && !faviconError ? (
            <img
              src={faviconUrl}
              alt=""
              className="w-8 h-8 rounded-[var(--radius-sm)] shrink-0 object-contain bg-[var(--bg-overlay)]"
              onError={() => setFaviconError(true)}
              aria-hidden="true"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-[var(--radius-sm)] shrink-0 bg-[var(--bg-overlay)] border border-[var(--border-subtle)] flex items-center justify-center text-[1.1rem]"
              aria-hidden="true"
            >
              {CATEGORY_ICON[feed.category] ?? "📰"}
            </div>
          )}
          <h2 className="m-0 text-[var(--font-size-xl)] font-bold leading-[var(--line-height-tight)]">
            {feed.name}
          </h2>
        </div>
        <div className="flex items-center gap-[var(--space-2)] flex-wrap mb-[var(--space-3)]">
          <a
            href={feed.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--font-size-sm)] break-all text-[var(--fg-muted)]"
          >
            {feed.url}
          </a>
          <span
            className={`inline-flex items-center px-[var(--space-2)] py-0.5 rounded-full text-[var(--font-size-xs)] font-semibold uppercase tracking-[0.04em] border-none font-[inherit] leading-[var(--line-height-tight)] whitespace-nowrap ${catBadgeClass}`}
          >
            <span aria-hidden="true" className="mr-[3px]">
              {CATEGORY_ICON[feed.category] ?? ""}
            </span>
            {CATEGORY_LABEL[feed.category] ?? feed.category}
          </span>
          <span className="text-[var(--font-size-xs)] bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-sm)] px-[var(--space-2)] py-0.5 text-[var(--fg-muted)] font-medium">
            {feed.lang.toUpperCase()}
          </span>
        </div>
        <div className="flex items-center gap-[var(--space-2)] text-[var(--font-size-base)]">
          <span className="text-[var(--fg-muted)]">30 日の記事数:</span>
          <span className="font-semibold">{feed.articles_30d}</span>
        </div>
      </section>

      {/* 記事一覧 */}
      <section>
        <h3 className="text-[var(--font-size-md)] font-semibold m-0 mb-[var(--space-3)] text-[var(--fg-muted)]">
          直近の記事
        </h3>
        {articlesError && <div className={errorClass}>取得エラー: {articlesError}</div>}
        {!articlesError && articles.length === 0 ? (
          <div className={loaderClass}>
            <span
              className="text-[2.5rem] block mb-[var(--space-3)] leading-none"
              aria-hidden="true"
            >
              📭
            </span>
            <div className="text-[var(--font-size-md)] font-semibold text-[var(--fg-secondary)] mb-[var(--space-1)]">
              記事がありません
            </div>
          </div>
        ) : (
          <div className="grid gap-[var(--space-3)]">
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
          <button
            type="button"
            className="block mx-auto mt-[var(--space-5)] px-[var(--space-6)] py-[var(--space-2)] bg-[var(--bg-overlay)] text-[var(--fg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] cursor-pointer text-[var(--font-size-sm)] font-[inherit] font-medium transition-[border-color,background] duration-100 hover:border-[var(--accent)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 disabled:cursor-progress focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
            onClick={loadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "読み込み中…" : "もっと見る"}
          </button>
        )}
      </section>
    </div>
  );
}
