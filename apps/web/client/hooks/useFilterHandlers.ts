import { useCallback } from "react";
import { buildSearch } from "../lib/routing";
import type { FeedCategory, FeedLang } from "../types/api";

interface FilterState {
  category: FeedCategory | "";
  lang: FeedLang | "";
  feedId: string;
  q: string;
  dateFrom: string;
  dateTo: string;
  unreadOnly: boolean;
  starredOnly: boolean;
  bookmarkedOnly: boolean;
}

interface SetFilterState {
  setFeedId: (v: string) => void;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  setUnreadOnly: (v: boolean) => void;
  setStarredOnly: (v: boolean) => void;
  setUrlFilters: (patch: { q?: string; bookmarksOnly?: boolean }) => void;
  setView: (v: "articles") => void;
}

export function useFilterHandlers(state: FilterState, setters: SetFilterState) {
  const { category, lang, feedId, q, dateFrom, dateTo, unreadOnly, starredOnly, bookmarkedOnly } =
    state;
  const {
    setFeedId,
    setDateFrom,
    setDateTo,
    setUnreadOnly,
    setStarredOnly,
    setUrlFilters,
    setView,
  } = setters;

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
    [
      category,
      lang,
      feedId,
      q,
      dateFrom,
      dateTo,
      unreadOnly,
      starredOnly,
      bookmarkedOnly,
      setFeedId,
      setDateFrom,
      setDateTo,
      setUnreadOnly,
      setStarredOnly,
    ],
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

  // Categories overview からカテゴリカードをクリックした際に articles ページへ遷移してフィルタを適用する
  const handleSelectCategory = useCallback(
    (id: FeedCategory) => {
      window.history.pushState(null, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
      setView("articles");
      pushFilter(id, lang, "", q, dateFrom, dateTo, unreadOnly, starredOnly);
    },
    [pushFilter, setView, lang, q, dateFrom, dateTo, unreadOnly, starredOnly],
  );

  return {
    handleCategoryChange,
    handleLangChange,
    handleFeedChange,
    handleQChange,
    handleDateFromChange,
    handleDateToChange,
    handleUnreadOnlyChange,
    handleStarredOnlyChange,
    handleClear,
    handleApplyPreset,
    handleBookmarkedOnlyToggle,
    handleFilterByCategory,
    handleSelectCategory,
  };
}
