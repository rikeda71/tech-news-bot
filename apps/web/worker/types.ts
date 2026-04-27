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
}

export type FeedCategory = "bigtech" | "ai" | "jp" | "zenn";
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

export interface ArticlesResponse {
  articles: Article[];
  nextCursor: string | null;
}

export interface FeedSummary {
  id: string;
  name: string;
  url: string;
  category: FeedCategory;
  lang: FeedLang;
  enabled: boolean;
  last_fetched_at: string | null;
  last_status: string | null;
  article_count: number;
}

export interface HealthResponse {
  status: "ok" | "degraded";
  now: string;
  db: {
    articles_total: number;
    feeds_total: number;
    feeds_enabled: number;
    latest_published_at: string | null;
    latest_fetched_at: string | null;
  };
}
