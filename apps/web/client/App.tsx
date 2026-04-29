import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useArticles } from "./hooks/useArticles";
import { useBookmarks } from "./hooks/useBookmarks";
import { useFilterHandlers } from "./hooks/useFilterHandlers";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useReadState } from "./hooks/useReadState";
import { useRecentSearches } from "./hooks/useRecentSearches";
import { useStarredState } from "./hooks/useStarredState";
import { useStats } from "./hooks/useStats";
import { ToastContext, useToastState } from "./hooks/useToast";
import { useUrlState } from "./hooks/useUrlState";
import {
  readAuthorFromPath,
  readFeedDetailFromPath,
  readFromUrl,
  readReportIdFromPath,
  readViewFromUrl,
} from "./lib/routing";
import { ArticlesView } from "./components/ArticlesView";
import { AuthorDetail } from "./components/AuthorDetail";
import { CategoriesOverview } from "./components/CategoriesOverview";
import { FeedDetail } from "./components/FeedDetail";
import { type AppView, Header } from "./components/Header";
import { ReportDetail } from "./components/ReportDetail";
import { ReportsList } from "./components/ReportsList";
import { ShortcutsHelp } from "./components/ShortcutsHelp";
import { StatsDashboard } from "./components/StatsDashboard";
import { ToastContainer } from "./components/ToastContainer";

function AppInner() {
  const [view, setView] = useState<AppView>(readViewFromUrl);
  const [feedDetailId, setFeedDetailId] = useState<string>(() => readFeedDetailFromPath() ?? "");
  const [authorName, setAuthorName] = useState<string>(() => readAuthorFromPath() ?? "");
  const [reportId, setReportId] = useState<number>(() => readReportIdFromPath() ?? 0);
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

  const { stats } = useStats();
  const { isRead } = useReadState();
  const { isStarred } = useStarredState();
  const { bookmarks, toggle: toggleBookmark } = useBookmarks();
  const recentSearches = useRecentSearches();

  const filterHandlers = useFilterHandlers(
    { category, lang, feedId, q, dateFrom, dateTo, unreadOnly, starredOnly, bookmarkedOnly },
    { setFeedId, setDateFrom, setDateTo, setUnreadOnly, setStarredOnly, setUrlFilters, setView },
  );

  const handleViewChange = useCallback((next: AppView) => {
    setView(next);
    setFeedDetailId("");
    setAuthorName("");
    setReportId(0);
    const path =
      next === "stats"
        ? "/stats"
        : next === "categories"
          ? "/categories"
          : next === "reports"
            ? "/reports"
            : "/";
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }
  }, []);

  // popstate でブラウザ戻る/進むに追従する (useUrlState が q/category/lang/bookmarksOnly を処理、
  // feedId/dateFrom/dateTo/unreadOnly/starredOnly はこちらで処理)
  useEffect(() => {
    const onPop = () => {
      const nextView = readViewFromUrl();
      setView(nextView);
      if (nextView === "feed") {
        setFeedDetailId(readFeedDetailFromPath() ?? "");
        setAuthorName("");
        setReportId(0);
        return;
      }
      if (nextView === "author") {
        setAuthorName(readAuthorFromPath() ?? "");
        setFeedDetailId("");
        setReportId(0);
        return;
      }
      if (nextView === "report") {
        setReportId(readReportIdFromPath() ?? 0);
        setFeedDetailId("");
        setAuthorName("");
        return;
      }
      setFeedDetailId("");
      setAuthorName("");
      setReportId(0);
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

  // filters.q が URL に反映されたタイミングで検索履歴に追加する
  useEffect(() => {
    if (q !== "") {
      recentSearches.add(q);
    }
    // recentSearches.add は安定した参照なので依存配列に含めない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // 記事カードの取得元クリックでフィード詳細へ drill-down する
  const handleGoToFeedDetail = useCallback((id: string) => {
    window.history.pushState(null, "", `/feed/${encodeURIComponent(id)}`);
    setView("feed");
    setFeedDetailId(id);
  }, []);

  const handleBackFromFeedDetail = useCallback(() => {
    window.history.pushState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    setView("articles");
    setFeedDetailId("");
  }, []);

  const handleGoToAuthorDetail = useCallback((name: string) => {
    window.history.pushState(null, "", `/author/${encodeURIComponent(name)}`);
    setView("author");
    setAuthorName(name);
  }, []);

  const handleBackFromAuthorDetail = useCallback(() => {
    window.history.pushState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    setView("articles");
    setAuthorName("");
  }, []);

  const handleSelectReport = useCallback((id: number) => {
    window.history.pushState(null, "", `/reports/${id}`);
    setView("report");
    setReportId(id);
  }, []);

  const handleBackFromReportDetail = useCallback(() => {
    window.history.pushState(null, "", "/reports");
    setView("reports");
    setReportId(0);
  }, []);

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

  // useArticles より先にフィルタ結果を算出できないため、前回レンダリング時の値を ref で保持して渡す。
  // これにより autoLoad.filteredLength は常に 1 レンダリング遅れの値になるが、
  // 自動 loadMore の発火条件としては十分な精度がある。
  const filteredLengthRef = useRef(0);
  const isFilterActive = unreadOnly || starredOnly || bookmarkedOnly;

  const {
    articles: allArticles,
    loading,
    loadingMore,
    error,
    nextCursor,
    loadMore,
    autoLoadStopped,
  } = useArticles(query, {
    filteredLength: filteredLengthRef.current,
    isFilterActive,
  });

  // 未読・スター・ブックマークフィルタはクライアントサイドで適用 (サーバー API はこれらを知らないため)
  const articles = useMemo(() => {
    let filtered = allArticles;
    if (unreadOnly) filtered = filtered.filter((a) => !isRead(a.id));
    if (starredOnly) filtered = filtered.filter((a) => isStarred(a.id));
    if (bookmarkedOnly) filtered = filtered.filter((a) => bookmarks.has(a.guid));
    // 次レンダリングの autoLoad.filteredLength として使う
    filteredLengthRef.current = filtered.length;
    return filtered;
  }, [allArticles, unreadOnly, starredOnly, bookmarkedOnly, isRead, isStarred, bookmarks]);

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

  const handleSearchFocus = useCallback(() => {
    searchRef.current?.focus();
  }, []);

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
    <div className="max-w-[var(--max-width-content)] mx-auto pt-[calc(var(--header-height)+var(--space-6))] pb-[var(--space-12)] px-[var(--space-4)]">
      <Header view={view} onViewChange={handleViewChange} />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />

      {view === "stats" ? (
        <StatsDashboard onNavigateToAuthor={handleGoToAuthorDetail} />
      ) : view === "categories" ? (
        <CategoriesOverview onSelectCategory={filterHandlers.handleSelectCategory} />
      ) : view === "reports" ? (
        <ReportsList onSelectReport={handleSelectReport} />
      ) : view === "report" && reportId > 0 ? (
        <ReportDetail id={reportId} onBack={handleBackFromReportDetail} />
      ) : view === "feed" && feedDetailId ? (
        <FeedDetail
          feedId={feedDetailId}
          onBack={handleBackFromFeedDetail}
          onFilterByFeedId={handleGoToFeedDetail}
          onFilterByCategory={filterHandlers.handleFilterByCategory}
        />
      ) : view === "author" && authorName ? (
        <AuthorDetail
          author={authorName}
          onBack={handleBackFromAuthorDetail}
          onFilterByCategory={filterHandlers.handleFilterByCategory}
          onFilterByFeedId={handleGoToFeedDetail}
        />
      ) : (
        <ArticlesView
          searchRef={searchRef}
          articles={articles}
          loading={loading}
          loadingMore={loadingMore}
          error={error}
          nextCursor={nextCursor}
          loadMore={loadMore}
          autoLoadStopped={autoLoadStopped}
          selectedIndex={selectedIndex}
          q={q}
          category={category}
          lang={lang}
          feedId={feedId}
          dateFrom={dateFrom}
          dateTo={dateTo}
          unreadOnly={unreadOnly}
          starredOnly={starredOnly}
          bookmarkedOnly={bookmarkedOnly}
          stats={stats}
          onQChange={filterHandlers.handleQChange}
          onCategoryChange={filterHandlers.handleCategoryChange}
          onLangChange={filterHandlers.handleLangChange}
          onFeedChange={filterHandlers.handleFeedChange}
          onDateFromChange={filterHandlers.handleDateFromChange}
          onDateToChange={filterHandlers.handleDateToChange}
          onUnreadOnlyChange={filterHandlers.handleUnreadOnlyChange}
          onStarredOnlyChange={filterHandlers.handleStarredOnlyChange}
          onClear={filterHandlers.handleClear}
          onBookmarkedOnlyToggle={filterHandlers.handleBookmarkedOnlyToggle}
          onApplyPreset={filterHandlers.handleApplyPreset}
          onFilterByCategory={filterHandlers.handleFilterByCategory}
          onGoToFeedDetail={handleGoToFeedDetail}
          onGoToAuthorDetail={handleGoToAuthorDetail}
        />
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
