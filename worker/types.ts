export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  COLLECTOR_CONCURRENCY: string;
  COLLECTOR_TIMEOUT_MS: string;
  SUMMARY_MAX_LENGTH: string;
}
