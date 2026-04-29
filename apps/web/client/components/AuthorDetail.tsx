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
    <div className="py-[var(--space-2)]">
      <div className="flex flex-col gap-[var(--space-3)] mb-[var(--space-6)]">
        {/* 戻るボタン */}
        <button
          type="button"
          className="inline-flex items-center gap-[var(--space-1)] bg-transparent border-none text-[var(--accent)] cursor-pointer text-[var(--font-size-sm)] font-[inherit] py-[var(--space-1)] px-0 w-fit transition-opacity duration-100 hover:underline hover:opacity-85 focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 focus-visible:rounded-[var(--radius-sm)]"
          onClick={onBack}
        >
          ← 一覧に戻る
        </button>

        {/* 著者プロファイルカード */}
        <div className="flex items-center gap-[var(--space-4)] p-[var(--space-5)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)]">
          <div
            className="w-[52px] h-[52px] rounded-full bg-[var(--accent-soft)] border-2 border-[var(--accent)] flex items-center justify-center text-[1.4rem] font-bold text-[var(--accent)] shrink-0"
            aria-hidden="true"
          >
            {getInitial(author)}
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-[var(--font-size-xl)] font-bold leading-[var(--line-height-tight)]">
              {author}
            </h1>
            {!isLoading && !error && (
              <span className="text-[var(--font-size-sm)] text-[var(--fg-muted)] font-medium">
                {articles.length} 件の記事
              </span>
            )}
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="text-center text-[var(--fg-muted)] py-[var(--space-8)] px-[var(--space-3)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-lg)] mt-[var(--space-4)] text-[var(--font-size-base)] leading-[var(--line-height-relaxed)]">
          読み込み中…
        </div>
      )}
      {error && !isLoading && (
        <div className="text-center text-[var(--danger)] py-[var(--space-8)] px-[var(--space-3)] border border-[rgba(207,34,46,0.3)] rounded-[var(--radius-lg)] mt-[var(--space-4)] text-[var(--font-size-base)] leading-[var(--line-height-relaxed)] bg-[var(--danger-soft)]">
          取得エラー: {error}
        </div>
      )}
      {!isLoading && !error && articles.length === 0 && (
        <div className="text-center text-[var(--fg-muted)] py-[var(--space-8)] px-[var(--space-3)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-lg)] mt-[var(--space-4)] text-[var(--font-size-base)] leading-[var(--line-height-relaxed)]">
          <span className="text-[2.5rem] block mb-[var(--space-3)] leading-none" aria-hidden="true">
            📭
          </span>
          <div className="text-[var(--font-size-md)] font-semibold text-[var(--fg-secondary)] mb-[var(--space-1)]">
            記事がありません
          </div>
        </div>
      )}

      {articles.length > 0 && (
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
    </div>
  );
}
