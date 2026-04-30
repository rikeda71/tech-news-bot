import { type Dispatch, type RefObject, type SetStateAction, useCallback, useEffect } from "react";
import type { AppView } from "../components/Header";
import {
  readAuthorFromPath,
  readFeedDetailFromPath,
  readFromUrl,
  readReportIdFromPath,
  readViewFromUrl,
} from "../lib/routing";
import type { Article } from "../types/api";

export interface NavState {
  setView: (view: AppView) => void;
  setFeedDetailId: (id: string) => void;
  setAuthorName: (name: string) => void;
  setReportId: (id: number) => void;
  setFeedId: (id: string) => void;
  setDateFrom: (date: string) => void;
  setDateTo: (date: string) => void;
  setUnreadOnly: (value: boolean) => void;
  setStarredOnly: (value: boolean) => void;
}

export interface KbState {
  articles: Article[];
  selectedIndex: number;
  helpOpen: boolean;
  setSelectedIndex: Dispatch<SetStateAction<number>>;
  setHelpOpen: (open: boolean) => void;
  toggleBookmark: (guid: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
}

export interface NavHandlers {
  handleViewChange: (next: AppView) => void;
  handleGoToFeedDetail: (id: string) => void;
  handleBackFromFeedDetail: () => void;
  handleGoToAuthorDetail: (name: string) => void;
  handleBackFromAuthorDetail: () => void;
  handleSelectReport: (id: number) => void;
  handleBackFromReportDetail: () => void;
  handleKbNext: () => void;
  handleKbPrev: () => void;
  handleKbOpen: () => void;
  handleKbBookmark: () => void;
  handleKbShowHelp: () => void;
  handleKbClose: () => void;
  handleKbTop: () => void;
  handleKbBottom: () => void;
  handleSearchFocus: () => void;
}

/**
 * popstate (ブラウザ戻る/進む)、ナビゲーション操作、keyboard shortcut callbacks を一元管理するフック。
 * App.tsx から切り出し、view / detail 系の state 操作と keyboard handler の定義を集約する。
 */
export function useNavHandlers(navState: NavState, kbState: KbState): NavHandlers {
  const {
    setView,
    setFeedDetailId,
    setAuthorName,
    setReportId,
    setFeedId,
    setDateFrom,
    setDateTo,
    setUnreadOnly,
    setStarredOnly,
  } = navState;

  const {
    articles,
    selectedIndex,
    helpOpen,
    setSelectedIndex,
    setHelpOpen,
    toggleBookmark,
    searchRef,
  } = kbState;

  // popstate でブラウザ戻る/進むに追従する
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
  }, [
    setView,
    setFeedDetailId,
    setAuthorName,
    setReportId,
    setFeedId,
    setDateFrom,
    setDateTo,
    setUnreadOnly,
    setStarredOnly,
  ]);

  const handleViewChange = useCallback(
    (next: AppView) => {
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
    },
    [setView, setFeedDetailId, setAuthorName, setReportId],
  );

  const handleGoToFeedDetail = useCallback(
    (id: string) => {
      window.history.pushState(null, "", `/feed/${encodeURIComponent(id)}`);
      setView("feed");
      setFeedDetailId(id);
    },
    [setView, setFeedDetailId],
  );

  const handleBackFromFeedDetail = useCallback(() => {
    window.history.pushState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    setView("articles");
    setFeedDetailId("");
  }, [setView, setFeedDetailId]);

  const handleGoToAuthorDetail = useCallback(
    (name: string) => {
      window.history.pushState(null, "", `/author/${encodeURIComponent(name)}`);
      setView("author");
      setAuthorName(name);
    },
    [setView, setAuthorName],
  );

  const handleBackFromAuthorDetail = useCallback(() => {
    window.history.pushState(null, "", "/");
    window.dispatchEvent(new PopStateEvent("popstate"));
    setView("articles");
    setAuthorName("");
  }, [setView, setAuthorName]);

  const handleSelectReport = useCallback(
    (id: number) => {
      window.history.pushState(null, "", `/reports/${id}`);
      setView("report");
      setReportId(id);
    },
    [setView, setReportId],
  );

  const handleBackFromReportDetail = useCallback(() => {
    window.history.pushState(null, "", "/reports");
    setView("reports");
    setReportId(0);
  }, [setView, setReportId]);

  // ---- keyboard shortcut callbacks ----

  const handleKbNext = useCallback(() => {
    setSelectedIndex((prev) => Math.min(prev + 1, articles.length - 1));
  }, [articles.length, setSelectedIndex]);

  const handleKbPrev = useCallback(() => {
    setSelectedIndex((prev) => (prev <= 0 ? 0 : prev - 1));
  }, [setSelectedIndex]);

  const handleKbOpen = useCallback(() => {
    if (selectedIndex < 0 || selectedIndex >= articles.length) return;
    const article = articles[selectedIndex];
    window.open(article.url, "_blank", "noopener,noreferrer");
  }, [selectedIndex, articles]);

  const handleKbBookmark = useCallback(() => {
    if (selectedIndex < 0 || selectedIndex >= articles.length) return;
    toggleBookmark(articles[selectedIndex].guid);
  }, [selectedIndex, articles, toggleBookmark]);

  const handleKbShowHelp = useCallback(() => setHelpOpen(true), [setHelpOpen]);

  const handleKbClose = useCallback(() => {
    if (helpOpen) {
      setHelpOpen(false);
    } else {
      setSelectedIndex(-1);
    }
  }, [helpOpen, setHelpOpen, setSelectedIndex]);

  const handleKbTop = useCallback(() => {
    setSelectedIndex(articles.length > 0 ? 0 : -1);
  }, [articles.length, setSelectedIndex]);

  const handleKbBottom = useCallback(() => {
    setSelectedIndex(articles.length > 0 ? articles.length - 1 : -1);
  }, [articles.length, setSelectedIndex]);

  const handleSearchFocus = useCallback(() => {
    searchRef.current?.focus();
  }, [searchRef]);

  return {
    handleViewChange,
    handleGoToFeedDetail,
    handleBackFromFeedDetail,
    handleGoToAuthorDetail,
    handleBackFromAuthorDetail,
    handleSelectReport,
    handleBackFromReportDetail,
    handleKbNext,
    handleKbPrev,
    handleKbOpen,
    handleKbBookmark,
    handleKbShowHelp,
    handleKbClose,
    handleKbTop,
    handleKbBottom,
    handleSearchFocus,
  };
}
