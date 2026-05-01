/**
 * API エンドポイントのレスポンス型を集約する。
 * ハンドラ実装側で `c.json<ResponseType>(payload)` に指定してコンパイル時に整合性を確認する。
 *
 * 注意: JSON の shape (フィールド名・型) はクライアントとの後方互換を保つため変更禁止。
 * client/types/api.ts と shape を一致させること。
 */

import type { Article, FeedDiagnostic, FeedFailure, FeedHealth, HealthCronRun } from "../types";
import type {
  CalendarItem,
  CategoryTrendPoint,
  FeedActivityRow,
  TopAuthorRow,
  TopPublisherRow,
  ByLang30d,
} from "../db/articles";
import type { FeedWithStats } from "../db/feeds";
import type { CategorySummary } from "../db/feed-stats";
import type { ReportDetailRow, ReportRow } from "../db/reports";
import type { RunRow, RunFeedRow } from "../db/runs";

// ---- /api/articles ----

export interface ArticleListResponse {
  articles: Article[];
  nextCursor: string | null;
}

export interface ArticleRandomResponse {
  articles: Article[];
}

export interface ArticleCalendarResponse {
  days: number;
  items: CalendarItem[];
}

export interface ArticleSearchResponse {
  query: string;
  tokens: string[];
  articles: Article[];
  next_cursor: string | null;
}

export interface ArticleRelatedResponse {
  items: Article[];
}

export interface ArticleNeighborsResponse {
  prev: Article | null;
  next: Article | null;
}

export interface ArticleArchiveResponse {
  year: number;
  month: number;
  items: Article[];
  total: number;
}

export interface ArticleByAuthorResponse {
  articles: Article[];
  next_cursor: string | null;
}

export interface ArticleByFeedResponse {
  articles: Article[];
  next_cursor: string | null;
}

export interface ArticleByCategoryResponse {
  articles: Article[];
  next_cursor: string | null;
}

export interface ArticleByDayResponse {
  date: string;
  articles: Article[];
  next_cursor: string | null;
  total: number;
}

// ---- /api/feeds ----

export interface FeedsListResponse {
  feeds: FeedWithStats[];
}

export interface FeedDetailResponse {
  feed: FeedWithStats;
  recent_articles: Article[];
}

/** フィード別ヘルス (run 単位集計) */
export interface FeedRunHealthResponse {
  feed_id: string;
  window_days: number;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  success_rate: number | null;
  last_run_at: string | null;
  last_run_status: "success" | "failed" | "skipped" | null;
  last_error: { at: string; message: string | null } | null;
  avg_duration_ms: number | null;
  articles_inserted_total: number;
}

// ---- /api/categories ----

export interface CategoriesResponse {
  categories: CategorySummary[];
}

// ---- /api/health ----

export interface HealthResponse {
  ok: boolean;
  version: string;
  now: string;
  feeds: {
    total: number;
    enabled: number;
  };
  articles: {
    total: number;
    last_24h: number;
  };
  last_cron_run: HealthCronRun | null;
}

export type HealthFeedsResponse = FeedHealth[];

// ---- /api/stats ----

export interface StatsResponse {
  total: number;
  last_published_at: string | null;
  last_fetched_at: string | null;
  last24h: number;
  by_category: Record<string, number>;
  by_lang: Record<string, number>;
  stale_feeds: Array<{
    id: string;
    name: string;
    last_status: string | null;
    last_fetched_at: string | null;
    last_error: string | null;
  }>;
  category_trend_30d: CategoryTrendPoint[];
  feed_activity: FeedActivityRow[];
  top_authors_30d: TopAuthorRow[];
  top_publishers_30d: TopPublisherRow[];
  by_lang_30d: ByLang30d;
}

// ---- /api/admin ----

export interface AdminCollectResponse {
  ok: boolean;
  run_id: number;
  async: boolean;
}

export interface AdminRunListResponse {
  runs: RunRow[];
}

export interface AdminRunDetailResponse {
  run: RunRow & { duration_ms: number | null };
  feeds: RunFeedRow[];
}

export interface AdminFeedsDiagnosticsResponse {
  feeds: FeedDiagnostic[];
  count: number;
}

export interface AdminCronHealthResponse {
  window_days: number;
  runs_total: number;
  runs_succeeded: number;
  runs_failed: number;
  avg_run_ms: number | null;
  articles_collected: number;
  top_failing_feeds: FeedFailure[];
}

export interface AdminFeedEnabledResponse {
  id: string;
  enabled: boolean;
}

export interface AdminReportSaveResponse {
  ok: true;
  id: number;
}

export interface AdminReportOverlapResponse {
  error: string;
  conflicting_ids: number[];
}

export interface AdminReportListResponse {
  reports: ReportRow[];
}

export interface AdminReportDetailResponse {
  report: ReportDetailRow;
}

export interface AdminCollectorRunResponse {
  started_at: string;
  finished_at: string;
  results: Array<{
    feed_id: string;
    status: "ok" | "error" | "not_modified";
    new_articles: number;
    error?: string;
  }>;
}

// ---- エラーレスポンス共通 ----

export interface ErrorResponse {
  error: string;
}
