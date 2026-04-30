/**
 * D1 クエリ結果の Row 型を集約する。
 * `.all<RowType>()` / `.first<RowType>()` のジェネリック引数として使用する。
 * DB スキーマを変更した場合はこのファイルも合わせて更新すること。
 */

/**
 * D1PreparedStatement.bind() が受け付けるパラメータ型。
 * SQLite の型システムに対応: null / 文字列 / 整数・浮動小数点 / 真偽値 / バイナリ。
 * workers-types の bind シグネチャは `unknown[]` だが、実際に安全に渡せる値を明示するため
 * プロジェクト内で定義する。
 */
export type D1BindParameter = null | string | number | boolean | ArrayBuffer;

/** articles テーブルの全カラム (JOIN なし) */
export interface ArticleDbRow {
  id: number;
  guid: string;
  feed_id: string;
  /** feeds テーブル LEFT JOIN 時のみ含まれる */
  feed_name: string | null;
  title: string;
  url: string;
  summary: string | null;
  author: string | null;
  published_at: string;
  fetched_at: string;
  /** DB 上は TEXT だが FeedCategory 列挙と一致する */
  category: string;
  /** DB 上は TEXT だが FeedLang 列挙と一致する */
  lang: string;
}

/** feeds テーブルの基本カラム (articles JOIN なし) */
export interface FeedDbRow {
  id: string;
  name: string;
  url: string;
  category: string;
  lang: string;
  /** DB 上は INTEGER (0/1) */
  enabled: number;
  last_fetched_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_etag: string | null;
  last_modified: string | null;
  consecutive_failures: number;
  last_success_at: string | null;
  last_failure_at: string | null;
}

/** feeds + articles 集計 JOIN 結果 */
export interface FeedWithStatsDbRow {
  id: string;
  name: string;
  url: string;
  category: string;
  lang: string;
  /** DB 上は INTEGER (0/1) */
  enabled: number;
  articles_30d: number;
  last_published_at: string | null;
}

/** collector_runs テーブルの全カラム */
export interface CollectorRunDbRow {
  id: number;
  started_at: string;
  completed_at: string | null;
  feeds_total: number | null;
  feeds_ok: number | null;
  feeds_failed: number | null;
  articles_inserted: number | null;
  error: string | null;
}

/** collector_run_feeds テーブルの全カラム */
export interface CollectorRunFeedDbRow {
  run_id: number;
  feed_id: string;
  status: "ok" | "failed" | "skipped";
  articles_inserted: number;
  duration_ms: number;
  error: string | null;
}

/** getCronHealth クエリ結果 */
export interface CronHealthDbRow {
  runs_total: number;
  runs_succeeded: number;
  runs_failed: number;
  avg_run_ms: number | null;
  articles_collected: number;
}

/** getFeedFailures クエリ結果 */
export interface FeedFailureDbRow {
  feed_id: string;
  failures: number;
  successes: number;
  last_error: string | null;
  last_attempted_at: string | null;
}

/** getFeedHealth (runs) クエリ結果 */
export interface FeedHealthRunDbRow {
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  last_run_at: string | null;
  last_run_status: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  avg_duration_ms: number | null;
  /** SUM は対象行が 0 件の場合 NULL を返すため nullable */
  articles_inserted_total: number | null;
}

/** getFeedsDiagnostics クエリ結果 */
export interface FeedDiagnosticDbRow {
  id: string;
  name: string;
  url: string;
  category: string;
  lang: string;
  enabled: number;
  last_fetched_at: string | null;
  last_status: string | null;
  last_error: string | null;
  last_etag: string | null;
  last_modified: string | null;
  fetch_error_count: number;
  articles_total: number;
  articles_30d: number;
  last_published_at: string | null;
}

/** getCategoriesSummary クエリ結果 */
export interface CategorySummaryDbRow {
  category: string;
  feeds_count: number;
  articles_30d: number;
  last_published_at: string | null;
}

/** getFeedHealth (feeds.ts) クエリ結果 */
export interface FeedHealthFeedsDbRow {
  id: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  consecutive_failures: number;
  articles_last_7d: number;
}

/** getHealthSummary — articles 集計クエリ結果 */
export interface HealthArticleStatsDbRow {
  articles_total: number;
  latest_published_at: string | null;
  latest_fetched_at: string | null;
}

/** getHealthSummary — feeds 集計クエリ結果 */
export interface HealthFeedStatsDbRow {
  feeds_total: number;
  /** SUM(CASE WHEN enabled = 1 ...) は行が 0 件の場合 NULL を返す */
  feeds_enabled: number | null;
}
