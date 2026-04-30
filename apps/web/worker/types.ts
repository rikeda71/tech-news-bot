export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  COLLECTOR_CONCURRENCY: string;
  COLLECTOR_TIMEOUT_MS: string;
  COLLECTOR_RETRIES: string;
  SUMMARY_MAX_LENGTH: string;
  RETENTION_DAYS: string;
  CORS_ALLOWED_ORIGINS: string;
  ADMIN_TOKEN?: string;
  // ローテーション中に新旧両方のトークンを受け入れるための次世代 secret
  ADMIN_TOKEN_NEXT?: string;
  // preview 環境では "1" をセット。admin/collector を no-op にする。
  READONLY?: string;
  // preview 環境では binding が存在しない場合があるため optional
  COLLECTOR_AE?: AnalyticsEngineDataset;
  ALERT_WEBHOOK_URL?: string;
  ALERT_MIN_FAILURES?: string;
  ALERT_FEED_STREAK?: string;
  // Slack/Discord 互換 webhook URL (wrangler secret put COLLECTOR_ALERT_WEBHOOK)
  COLLECTOR_ALERT_WEBHOOK?: string;
  // 閾値: feeds_failed がこの値以上になったら通知する (default: "5")
  COLLECTOR_ALERT_THRESHOLD?: string;
  // Cloudflare Access (Zero Trust) — /api/admin/* の JWT 検証に使う
  // 本番では `wrangler secret put` で登録。toml には書かない。
  CF_ACCESS_AUD?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  // ローカル開発でアクセス JWT 検証をスキップする ("1" でスキップ)
  SKIP_ACCESS_JWT?: string;
}

export type FeedCategory = "bigtech" | "ai" | "jp" | "personal";
export type FeedLang = "ja" | "en";

export interface FeedConfig {
  id: string;
  name: string;
  url: string;
  category: FeedCategory;
  lang: FeedLang;
  enabled: boolean;
}

export interface FeedsFile {
  version: number;
  feeds: FeedConfig[];
}

export interface Article {
  id: number;
  guid: string;
  feed_id: string;
  feed_name?: string;
  title: string;
  url: string;
  summary: string | null;
  author: string | null;
  published_at: string;
  fetched_at: string;
  category: FeedCategory;
  lang: FeedLang;
}

export interface HealthCronRun {
  id: number;
  started_at: string;
  completed_at: string;
  feeds_total: number;
  feeds_ok: number;
  feeds_failed: number;
  articles_inserted: number;
}

export interface FeedHealth {
  feed_id: string;
  feed_name: string;
  enabled: boolean;
  last_success_at: string | null;
  last_failure_at: string | null;
  consecutive_failures: number;
  articles_last_7d: number;
}

export interface CronHealth {
  window_days: number;
  runs_total: number;
  runs_succeeded: number;
  runs_failed: number;
  avg_run_ms: number | null;
  articles_collected: number;
  top_failing_feeds: FeedFailure[];
}

export interface FeedFailure {
  feed_id: string;
  failures: number;
  successes: number;
  last_error: string | null;
  last_attempted_at: string | null;
}

export interface FeedDiagnostic {
  id: string;
  name: string;
  url: string;
  category: FeedCategory;
  lang: FeedLang;
  enabled: boolean;
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
