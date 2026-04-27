export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  COLLECTOR_CONCURRENCY: string;
  COLLECTOR_TIMEOUT_MS: string;
  SUMMARY_MAX_LENGTH: string;
  RETENTION_DAYS: string;
  ADMIN_TOKEN?: string;
  // preview 環境では "1" をセット。admin/collector を no-op にする。
  READONLY?: string;
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
