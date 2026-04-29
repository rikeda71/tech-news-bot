import type { AppView } from "../components/Header";
import type { FeedCategory, FeedLang } from "../types/api";

export function readFromUrl(): {
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

export function buildSearch(
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

/** /feed/<id> パスを解析してフィード詳細ページの feedId を返す。それ以外は null。*/
export function readFeedDetailFromPath(): string | null {
  const m = window.location.pathname.match(/^\/feed\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** /author/<name> パスを解析して著者名を返す。それ以外は null。*/
export function readAuthorFromPath(): string | null {
  const m = window.location.pathname.match(/^\/author\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

export function readViewFromUrl(): AppView {
  if (window.location.pathname === "/stats") return "stats";
  if (window.location.pathname === "/categories") return "categories";
  if (readFeedDetailFromPath() !== null) return "feed";
  if (readAuthorFromPath() !== null) return "author";
  return "articles";
}

export function formatRelative(iso: string): string {
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
