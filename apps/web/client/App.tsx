import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArticleList } from "./components/ArticleList";
import { FilterBar } from "./components/FilterBar";
import { Header } from "./components/Header";
import { PresetBar } from "./components/PresetBar";
import { SearchInput } from "./components/SearchInput";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { StatsPanel } from "./components/Stats";
import { ToastContainer } from "./components/ToastContainer";
import { useArticles } from "./hooks/useArticles";
import { useBookmarks } from "./hooks/useBookmarks";
import { useFeeds } from "./hooks/useFeeds";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { usePresets } from "./hooks/usePresets";
import { useReadState } from "./hooks/useReadState";
import { useStarredState } from "./hooks/useStarredState";
import { useStats } from "./hooks/useStats";
import { ToastContext, useToastState } from "./hooks/useToast";
import { useUrlState } from "./hooks/useUrlState";
import type { FeedCategory, FeedLang } from "./types/api";

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "今";
  if (min < 60) return `${min} 分前`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} 時間前`;
  const d = Math.round(h / 24);
  return `${d} 日前`;
}

function readFromUrl(): {
  feedId: string;
  dateFrom: string;
  dateTo: string;
  unreadOnly: boolean;
  starredOnly: boolean;
} {
  const params = new URLSearchParams(window.location.search);
  return {
    feedId: params.get("feed_id") ?? "",
    dateFrom: params.get("date_from") ?? "",
    dateTo: params.get("date_to") ?? "",
    unreadOnly: params.get("unread") === "1",
    starredOnly: params.get("starred") === "1",
  };
}

function buildSearch(
  category: FeedCategory | "",
  lang: FeedLang | "",
  feedId: string,
  q: string,
  dateFrom: string,
  dateTo: string,
  unreadOnly: boolean,
  starredOnly: boolean,
  bookmarksOnly: boolean,
): string {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (lang) params.set("lang", lang);
  if (feedId) params.set("feed_id", feedId);
  if (q) params.set("q", q);
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  // true のときだけ付ける
  if (unreadOnly) params.set("unread", "1");
  if (starredOnly) params.set("starred", "1");
  if (bookmarksOnly) params.set("bookmarks", "only");
  const s = params.toString();
  return s ? `?${s}` : window.location.pathname;
}

function AppInner() {
  const [urlFilters, setUrlFilters] = useUrlState();
  const { q, category, lang, bookmarksOnly: bookmarkedOnly } = urlFilters;
  const [feedId, setFeedId] = useState<string>(() => readFromUrl().feedId);
  const [dateFrom, setDateFrom] = useState<string>(() => readFromUrl().dateFrom);
  const [dateTo, setDateTo] = useState<string>(() => readFromUrl().dateTo);
  const [unreadOnly, setUnreadOnly] = useState<boolean>(() => readFromUrl().unreadOnly);
  const [starredOnly, setStarredOnly] = useState<boolean>(() => readFromUrl().starredOnly);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [helpOpen, setHelpOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  const { feeds } = useFeeds();
  const { stats } = useStats();
  const { isRead } = useReadState();
  const { isStarred } = useStarredState();
  const { bookmarks, toggle: toggleBookmark } = useBookmarks();
  const { presets, addPreset, removePreset } = usePresets();

  // popstate でブラウザ戻る/進むに追従する (useUrlState が q/category/lang/bookmarksOnly を処理、
  // feedId/dateFrom/dateTo/unreadOnly/starredOnly はこちらで処理)
  useEffect(() => {
    const onPop = () => {
      const next = readFromUrl();
      setFeedId(next.feedId);
      setDateFrom(next.dateFrom);
      setDateTo(next.dateTo);
      setUnreadOnly(next.unreadOnly);
      setStarredOnly(next.starredOnly);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // フィルタ変更時は pushState で履歴に積む
  // useUrlState が q/category/lang/bookmarksOnly の URL 同期を担うため、
  // pushState 後に popstate を dispatch して useUrlState のキャッシュを更新する
  const pushFilter = useCallback(
    (
      nextCategory: FeedCategory | "",
      nextLang: FeedLang | "",
      nextFeedId: string,
      nextQ: string,
      nextDateFrom: string,
      nextDateTo: string,
      nextUnreadOnly: boolean,
      nextStarredOnly: boolean,
    ) => {
      const next = buildSearch(
        nextCategory,
        nextLang,
        nextFeedId,
        nextQ,
        nextDateFrom,
        nextDateTo,
        nextUnreadOnly,
        nextStarredOnly,
        bookmarkedOnly,
      );
      const current = buildSearch(
        category,
        lang,
        feedId,
        q,
        dateFrom,
        dateTo,
        unreadOnly,
        starredOnly,
        bookmarkedOnly,
      );
      if (next !== current) {
        window.history.pushState(null, "", next);
        // useUrlState の subscribe リスナー (popstate) を起動してキャッシュを無効化する
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
      setFeedId(nextFeedId);
      setDateFrom(nextDateFrom);
      setDateTo(nextDateTo);
      setUnreadOnly(nextUnreadOnly);
      setStarredOnly(nextStarredOnly);
    },
    [category, lang, feedId, q, dateFrom, dateTo, unreadOnly, starredOnly, bookmarkedOnly],
  );

  const handleCategoryChange = useCallback(
    (v: FeedCategory | "") =>
      pushFilter(v, lang, v ? feedId : "", q, dateFrom, dateTo, unreadOnly, starredOnly),
    [pushFilter, lang, feedId, q, dateFrom, dateTo, unreadOnly, starredOnly],
  );

  const handleLangChange = useCallback(
    (v: FeedLang | "") =>
      pushFilter(category, v, v ? feedId : "", q, dateFrom, dateTo, unreadOnly, starredOnly),
    [pushFilter, category, feedId, q, dateFrom, dateTo, unreadOnly, starredOnly],
  );

  const handleFeedChange = useCallback(
    (id: string) => pushFilter(category, lang, id, q, dateFrom, dateTo, unreadOnly, starredOnly),
    [pushFilter, category, lang, q, dateFrom, dateTo, unreadOnly, starredOnly],
  );

  const handleQChange = useCallback((v: string) => setUrlFilters({ q: v }), [setUrlFilters]);

  const handleDateFromChange = useCallback(
    (v: string) => pushFilter(category, lang, feedId, q, v, dateTo, unreadOnly, starredOnly),
    [pushFilter, category, lang, feedId, q, dateTo, unreadOnly, starredOnly],
  );

  const handleDateToChange = useCallback(
    (v: string) => pushFilter(category, lang, feedId, q, dateFrom, v, unreadOnly, starredOnly),
    [pushFilter, category, lang, feedId, q, dateFrom, unreadOnly, starredOnly],
  );

  const handleUnreadOnlyChange = useCallback(
    (v: boolean) => pushFilter(category, lang, feedId, q, dateFrom, dateTo, v, starredOnly),
    [pushFilter, category, lang, feedId, q, dateFrom, dateTo, starredOnly],
  );

  const handleStarredOnlyChange = useCallback(
    (v: boolean) => pushFilter(category, lang, feedId, q, dateFrom, dateTo, unreadOnly, v),
    [pushFilter, category, lang, feedId, q, dateFrom, dateTo, unreadOnly],
  );

  const handleClear = useCallback(
    () => pushFilter("", "", "", "", "", "", false, false),
    [pushFilter],
  );

  const handleApplyPreset = useCallback(
    (filters: {
      category?: FeedCategory | "";
      lang?: FeedLang | "";
      feedId?: string;
      q?: string;
      unreadOnly?: boolean;
      starredOnly?: boolean;
      dateFrom?: string;
      dateTo?: string;
    }) => {
      pushFilter(
        filters.category ?? "",
        filters.lang ?? "",
        filters.feedId ?? "",
        filters.q ?? "",
        filters.dateFrom ?? "",
        filters.dateTo ?? "",
        filters.unreadOnly ?? false,
        filters.starredOnly ?? false,
      );
    },
    [pushFilter],
  );

  const handleBookmarkedOnlyToggle = useCallback(() => {
    setUrlFilters({ bookmarksOnly: !bookmarkedOnly });
  }, [setUrlFilters, bookmarkedOnly]);

  // カード上のバッジ/取得元クリックでフィルタを適用する
  const handleFilterByCategory = useCallback(
    (c: FeedCategory) => pushFilter(c, lang, "", q, dateFrom, dateTo, unreadOnly, starredOnly),
    [pushFilter, lang, q, dateFrom, dateTo, unreadOnly, starredOnly],
  );

  const handleFilterByFeedId = useCallback(
    (id: string) => pushFilter(category, lang, id, q, dateFrom, dateTo, unreadOnly, starredOnly),
    [pushFilter, category, lang, q, dateFrom, dateTo, unreadOnly, starredOnly],
  );

  const query = useMemo(
    () => ({
      category: category || undefined,
      lang: lang || undefined,
      feedId: feedId || undefined,
      q: q || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [category, lang, feedId, q, dateFrom, dateTo],
  );

  const {
    articles: allArticles,
    loading,
    loadingMore,
    error,
    nextCursor,
    loadMore,
  } = useArticles(query);

  // 未読・スター・ブックマークフィルタはクライアントサイドで適用 (サーバー API はこれらを知らないため)
  const articles = useMemo(() => {
    let filtered = allArticles;
    if (unreadOnly) filtered = filtered.filter((a) => !isRead(a.id));
    if (starredOnly) filtered = filtered.filter((a) => isStarred(a.id));
    if (bookmarkedOnly) filtered = filtered.filter((a) => bookmarks.has(a.guid));
    return filtered;
  }, [allArticles, unreadOnly, starredOnly, bookmarkedOnly, isRead, isStarred, bookmarks]);

  const handleSearchFocus = useCallback(() => {
    searchRef.current?.focus();
  }, []);

  const handleKbNext = useCallback(() => {
    setSelectedIndex((prev) => Math.min(prev + 1, articles.length - 1));
  }, [articles.length]);

  const handleKbPrev = useCallback(() => {
    setSelectedIndex((prev) => (prev <= 0 ? 0 : prev - 1));
  }, []);

  const handleKbOpen = useCallback(() => {
    if (selectedIndex < 0 || selectedIndex >= articles.length) return;
    const article = articles[selectedIndex];
    window.open(article.url, "_blank", "noopener,noreferrer");
  }, [selectedIndex, articles]);

  const handleKbBookmark = useCallback(() => {
    if (selectedIndex < 0 || selectedIndex >= articles.length) return;
    toggleBookmark(articles[selectedIndex].guid);
  }, [selectedIndex, articles, toggleBookmark]);

  const handleKbShowHelp = useCallback(() => setHelpOpen(true), []);

  const handleKbClose = useCallback(() => {
    if (helpOpen) {
      setHelpOpen(false);
    } else {
      setSelectedIndex(-1);
    }
  }, [helpOpen]);

  const handleKbTop = useCallback(() => {
    setSelectedIndex(articles.length > 0 ? 0 : -1);
  }, [articles.length]);

  const handleKbBottom = useCallback(() => {
    setSelectedIndex(articles.length > 0 ? articles.length - 1 : -1);
  }, [articles.length]);

  useKeyboardShortcuts({
    onNext: handleKbNext,
    onPrev: handleKbPrev,
    onOpen: handleKbOpen,
    onBookmark: handleKbBookmark,
    onFocusSearch: handleSearchFocus,
    onShowHelp: handleKbShowHelp,
    onClose: handleKbClose,
    onTop: handleKbTop,
    onBottom: handleKbBottom,
  });

  return (
    <div className="app">
      <Header />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <header className="header">
        <span className="subtitle">
          {stats ? `${stats.total.toLocaleString()} 記事 · 直近 24h: ${stats.last24h}` : ""}
          {feeds.length > 0 ? ` · ${feeds.length} sources` : ""}
          {stats?.last_fetched_at ? ` · 最終更新 ${formatRelative(stats.last_fetched_at)}` : ""}
        </span>
        <button
          type="button"
          className={`bookmarks-only-toggle${bookmarkedOnly ? " active" : ""}`}
          onClick={handleBookmarkedOnlyToggle}
          aria-pressed={bookmarkedOnly}
        >
          ★ {bookmarks.size} 件{bookmarkedOnly ? " (表示中)" : ""}
        </button>
        {stats && stats.stale_feeds.length > 0 && (
          <details className="stale-warning">
            <summary>⚠ {stats.stale_feeds.length} 件の収集に問題があります</summary>
            <ul>
              {stats.stale_feeds.map((f) => (
                <li key={f.id}>
                  <strong>{f.name}</strong>
                  {f.last_status === "error" ? " · error" : " · stale"}
                  {f.last_fetched_at ? ` · ${formatRelative(f.last_fetched_at)}` : " · 未取得"}
                  {f.last_error && <div className="stale-error">{f.last_error}</div>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </header>

      {stats && <StatsPanel stats={stats} />}

      <PresetBar
        presets={presets}
        currentFilters={{ category, lang, feedId, q, unreadOnly, starredOnly, dateFrom, dateTo }}
        onApply={handleApplyPreset}
        onAdd={addPreset}
        onRemove={removePreset}
      />

      <div className="toolbar">
        <SearchInput ref={searchRef} value={q} onChange={handleQChange} />
        <FilterBar
          category={category}
          lang={lang}
          feedId={feedId}
          feeds={feeds}
          dateFrom={dateFrom}
          dateTo={dateTo}
          unreadOnly={unreadOnly}
          starredOnly={starredOnly}
          onCategoryChange={handleCategoryChange}
          onLangChange={handleLangChange}
          onFeedChange={handleFeedChange}
          onDateFromChange={handleDateFromChange}
          onDateToChange={handleDateToChange}
          onUnreadOnlyChange={handleUnreadOnlyChange}
          onStarredOnlyChange={handleStarredOnlyChange}
          onClear={handleClear}
        />
      </div>

      {loading && <div className="loader">読み込み中…</div>}
      {error && !loading && <div className="error">取得エラー: {error}</div>}
      {!loading && !error && articles.length === 0 && bookmarkedOnly && (
        <div className="empty">ブックマークがありません</div>
      )}
      {!loading && !error && articles.length === 0 && !bookmarkedOnly && (
        <div className="empty">記事はまだありません。Cron 実行をお待ちください。</div>
      )}

      {articles.length > 0 && (
        <ArticleList
          articles={articles}
          selectedIndex={selectedIndex}
          onFilterByCategory={handleFilterByCategory}
          onFilterByFeedId={handleFilterByFeedId}
          q={q}
        />
      )}

      {nextCursor && (
        <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "読み込み中…" : "もっと読み込む"}
        </button>
      )}
      <ToastContainer />
    </div>
  );
}

export default function App() {
  const toastState = useToastState();
  return (
    <ToastContext.Provider value={toastState}>
      <AppInner />
    </ToastContext.Provider>
  );
}
