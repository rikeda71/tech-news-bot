export type FeedCategory = "bigtech" | "ai" | "jp" | "zenn";
export type FeedLang = "ja" | "en";

export interface Article {
  id: number;
  guid: string;
  feed_id: string;
  feed_name: string | null;
  title: string;
  url: string;
  summary: string | null;
  author: string | null;
  published_at: string;
  fetched_at: string;
  category: FeedCategory;
  lang: FeedLang;
}

export interface ArticlesResponse {
  articles: Article[];
  nextCursor: string | null;
}

/** /api/feeds が返す FeedWithStats と shape を一致させること */
export interface FeedSummary {
  id: string;
  name: string;
  url: string;
  category: FeedCategory;
  lang: FeedLang;
  enabled: boolean;
  articles_30d: number;
  last_published_at: string | null;
}

export interface FeedsResponse {
  feeds: FeedSummary[];
}

export interface FeedDetail {
  id: string;
  name: string;
  url: string;
  category: FeedCategory;
  lang: FeedLang;
  enabled: boolean;
  articles_30d: number;
  last_published_at: string | null;
}

export interface FeedDetailResponse {
  feed: FeedDetail;
  recent_articles: Article[];
}

/** /api/articles/calendar の 1 日分エントリ (/api/articles の CalendarItem と同形) */
export interface CalendarDay {
  date: string;
  count: number;
}

/** /api/articles/calendar レスポンス shape */
export interface CalendarResponse {
  days: number;
  items: CalendarDay[];
}

export interface CategorySummary {
  id: FeedCategory;
  label: string;
  feeds_count: number;
  articles_30d: number;
  last_published_at: string | null;
}

export interface CategoriesResponse {
  categories: CategorySummary[];
}

// ---- /api/reports ----

export type ReportKind = "daily" | "weekly" | "monthly";

/** /api/reports の一覧アイテム (content を含まない) */
export interface ReportListItem {
  id: number;
  kind: ReportKind;
  period_start: string;
  period_end: string;
  category: string | null;
  lang: string | null;
  source_skill: string;
  generated_at: string;
}

/** /api/reports/:id の詳細 (content + meta_json を含む) */
export interface ReportDetail extends ReportListItem {
  content: string;
  meta_json: string | null;
}

export interface ReportListResponse {
  reports: ReportListItem[];
}

export interface ReportDetailResponse {
  report: ReportDetail;
}
