import { useCallback, useRef, useState, type RefObject } from "react";
import { useBookmarks } from "../hooks/useBookmarks";
import { useFeeds } from "../hooks/useFeeds";
import { usePresets } from "../hooks/usePresets";
import { useRecentSearches } from "../hooks/useRecentSearches";
import type { Stats } from "../hooks/useStats";
import type { Article } from "../types/api";
import type { FeedCategory, FeedLang } from "../types/api";
import { formatRelative } from "../lib/routing";
import { ArticleList } from "./ArticleList";
import { EmptyState } from "./EmptyState";
import { FilterBar } from "./FilterBar";
import { PresetBar } from "./PresetBar";
import { SearchInput } from "./SearchInput";
import { SearchSuggestions } from "./SearchSuggestions";
import { StatsPanel } from "./Stats";
import { StaleFeedsWarning } from "./StaleFeedsWarning";

interface Props {
  searchRef: RefObject<HTMLInputElement | null>;
  articles: Article[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  nextCursor: string | null;
  loadMore: () => void;
  autoLoadStopped: boolean;
  selectedIndex: number;
  q: string;
  category: FeedCategory | "";
  lang: FeedLang | "";
  feedId: string;
  dateFrom: string;
  dateTo: string;
  unreadOnly: boolean;
  starredOnly: boolean;
  bookmarkedOnly: boolean;
  stats: Stats | null;
  onQChange: (v: string) => void;
  onCategoryChange: (v: FeedCategory | "") => void;
  onLangChange: (v: FeedLang | "") => void;
  onFeedChange: (id: string) => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onUnreadOnlyChange: (v: boolean) => void;
  onStarredOnlyChange: (v: boolean) => void;
  onClear: () => void;
  onBookmarkedOnlyToggle: () => void;
  onApplyPreset: (filters: {
    category?: FeedCategory | "";
    lang?: FeedLang | "";
    feedId?: string;
    q?: string;
    unreadOnly?: boolean;
    starredOnly?: boolean;
    dateFrom?: string;
    dateTo?: string;
  }) => void;
  onFilterByCategory: (c: FeedCategory) => void;
  onGoToFeedDetail: (id: string) => void;
  onGoToAuthorDetail: (name: string) => void;
}

export function ArticlesView({
  searchRef,
  articles,
  loading,
  loadingMore,
  error,
  nextCursor,
  loadMore,
  autoLoadStopped,
  selectedIndex,
  q,
  category,
  lang,
  feedId,
  dateFrom,
  dateTo,
  unreadOnly,
  starredOnly,
  bookmarkedOnly,
  stats,
  onQChange,
  onCategoryChange,
  onLangChange,
  onFeedChange,
  onDateFromChange,
  onDateToChange,
  onUnreadOnlyChange,
  onStarredOnlyChange,
  onClear,
  onBookmarkedOnlyToggle,
  onApplyPreset,
  onFilterByCategory,
  onGoToFeedDetail,
  onGoToAuthorDetail,
}: Props) {
  const { feeds } = useFeeds();
  const { bookmarks } = useBookmarks();
  const { presets, addPreset, removePreset } = usePresets();
  const recentSearches = useRecentSearches();

  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [suggestVisible, setSuggestVisible] = useState(false);

  const handleSearchFocusIn = useCallback(() => {
    if (blurTimerRef.current !== null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
    setSuggestVisible(true);
  }, []);

  const handleSearchBlur = useCallback(() => {
    // mousedown の取りこぼし防止のため 150ms 遅延させる
    blurTimerRef.current = setTimeout(() => {
      setSuggestVisible(false);
    }, 150);
  }, []);

  const handleSuggestPick = useCallback(
    (picked: string) => {
      onQChange(picked);
      recentSearches.add(picked);
      setSuggestVisible(false);
      searchRef.current?.focus();
    },
    [onQChange, recentSearches, searchRef],
  );

  const handleSuggestRemove = useCallback(
    (item: string) => recentSearches.remove(item),
    [recentSearches],
  );

  const handleSuggestClearAll = useCallback(() => recentSearches.clear(), [recentSearches]);

  return (
    <>
      <header className="flex justify-between items-center flex-wrap gap-[var(--space-2)] mb-[var(--space-4)]">
        <span className="text-[var(--fg-muted)] text-[var(--font-size-sm)]">
          {stats ? `${stats.total.toLocaleString()} 記事 · 直近 24h: ${stats.last24h}` : ""}
          {feeds.length > 0 ? ` · ${feeds.length} sources` : ""}
          {stats?.last_fetched_at ? ` · 最終更新 ${formatRelative(stats.last_fetched_at)}` : ""}
        </span>
        <button
          type="button"
          className={`py-[5px] px-[var(--space-3)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-full)] text-[var(--font-size-sm)] font-[inherit] cursor-pointer whitespace-nowrap shrink-0 transition-[border-color,color,background] duration-100 hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2${bookmarkedOnly ? " bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)] font-semibold" : " text-[var(--fg-muted)]"}`}
          onClick={onBookmarkedOnlyToggle}
          aria-pressed={bookmarkedOnly}
        >
          ★ {bookmarks.size} 件{bookmarkedOnly ? " (表示中)" : ""}
        </button>
        {stats && <StaleFeedsWarning staleFeeds={stats.stale_feeds} />}
      </header>

      {stats && <StatsPanel stats={stats} />}

      <PresetBar
        presets={presets}
        currentFilters={{
          category,
          lang,
          feedId,
          q,
          unreadOnly,
          starredOnly,
          dateFrom,
          dateTo,
        }}
        onApply={onApplyPreset}
        onAdd={addPreset}
        onRemove={removePreset}
      />

      <div className="grid grid-cols-1 gap-[var(--space-3)] mb-[var(--space-5)] p-[var(--space-3)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] min-[720px]:[grid-template-columns:1fr_auto_auto_auto] min-[720px]:items-center">
        <div className="relative">
          <SearchInput
            ref={searchRef}
            value={q}
            onChange={onQChange}
            onFocus={handleSearchFocusIn}
            onBlur={handleSearchBlur}
          />
          <SearchSuggestions
            items={recentSearches.items}
            onPick={handleSuggestPick}
            onRemove={handleSuggestRemove}
            onClearAll={handleSuggestClearAll}
            visible={suggestVisible}
          />
        </div>
        <FilterBar
          category={category}
          lang={lang}
          feedId={feedId}
          feeds={feeds}
          dateFrom={dateFrom}
          dateTo={dateTo}
          unreadOnly={unreadOnly}
          starredOnly={starredOnly}
          onCategoryChange={onCategoryChange}
          onLangChange={onLangChange}
          onFeedChange={onFeedChange}
          onDateFromChange={onDateFromChange}
          onDateToChange={onDateToChange}
          onUnreadOnlyChange={onUnreadOnlyChange}
          onStarredOnlyChange={onStarredOnlyChange}
          onClear={onClear}
        />
      </div>

      {loading && (
        <div className="text-center text-[var(--fg-muted)] py-[var(--space-8)] px-[var(--space-3)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-lg)] mt-[var(--space-4)] text-[var(--font-size-base)] leading-[var(--line-height-relaxed)]">
          読み込み中…
        </div>
      )}
      {error && !loading && (
        <div className="text-center text-[var(--danger)] py-[var(--space-8)] px-[var(--space-3)] border border-[rgba(207,34,46,0.3)] rounded-[var(--radius-lg)] bg-[var(--danger-soft)] mt-[var(--space-4)] text-[var(--font-size-base)] leading-[var(--line-height-relaxed)]">
          取得エラー: {error}
        </div>
      )}
      {!loading && !error && articles.length === 0 && bookmarkedOnly && (
        <EmptyState
          icon="🔖"
          title="ブックマークがありません"
          body="記事カードのブックマークアイコンから追加できます。"
        />
      )}
      {!loading && !error && articles.length === 0 && !bookmarkedOnly && (
        <EmptyState icon="📭" title="記事がまだありません" body="Cron 実行をお待ちください。" />
      )}

      {articles.length > 0 && (
        <ArticleList
          articles={articles}
          selectedIndex={selectedIndex}
          onFilterByCategory={onFilterByCategory}
          onFilterByFeedId={onGoToFeedDetail}
          onNavigateToAuthor={onGoToAuthorDetail}
          q={q}
        />
      )}

      {nextCursor && (
        <button
          type="button"
          className="block mx-auto mt-[var(--space-5)] py-[var(--space-2)] px-[var(--space-6)] bg-[var(--bg-overlay)] text-[var(--fg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] cursor-pointer text-[var(--font-size-sm)] font-[inherit] font-medium transition-[border-color,background] duration-100 hover:border-[var(--accent)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 disabled:cursor-progress focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          onClick={loadMore}
          disabled={loadingMore}
        >
          {loadingMore
            ? "読み込み中…"
            : autoLoadStopped
              ? "自動読み込み停止 / もっと読み込む"
              : "もっと読み込む"}
        </button>
      )}
    </>
  );
}
