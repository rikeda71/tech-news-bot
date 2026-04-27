import type { Env, FeedConfig } from "../types";
import { loadEnabledFeeds } from "../feed-config";
import { parseFeed } from "./rssParser";
import { buildGuids } from "./deduplicator";
import { writeCollectorEvent } from "./metrics";
import { deleteOlderThan, insertArticles, type InsertableArticle } from "../db/articles";
import {
  loadFeedHeaders,
  recordFetchError,
  recordFetchSuccess,
  syncFeeds,
  updateFeedHeaders,
} from "../db/feeds";

const MAX_FEED_BYTES = 4 * 1024 * 1024; // 4MB
const MAX_ITEMS_PER_FEED = 50;
const ALLOWED_URL_PREFIXES = ["http://", "https://"];
// backoff: 500ms, 1000ms の 2 回まで。並列度 4 × max 1.5s = 6s < 30s cron 制限
const BACKOFF_BASE_MS = 500;

export interface CollectResult {
  feedId: string;
  status: "ok" | "error" | "not_modified";
  inserted: number;
  parsed: number;
  error?: string;
}

export interface CollectAllResult {
  total: number;
  inserted: number;
  pruned: number;
  results: CollectResult[];
  durationMs: number;
}

const USER_AGENT = "tech-news-bot/0.1 (+https://github.com/rikeda71/tech-news-bot)";

/** 一時障害とみなしてリトライすべき HTTP ステータスかどうか */
function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * リトライ対象かどうかを判定する。
 * - AbortError: タイムアウト
 * - TypeError: ネットワーク接続失敗 ("Failed to fetch" 等)
 * - HTTP 5xx / 429: 一時的なサーバー障害
 * - HTTP 4xx (429 除く): 恒久エラーのためリトライしない
 * テスト用に export する
 */
export function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  if (err instanceof TypeError) return true;
  const m = /^HTTP (\d+)/.exec(err.message);
  if (m) return isTransientStatus(Number(m[1]));
  // HTTP エラー以外の予期しないエラーはリトライしない
  return false;
}

/** fetchFeedOnce の戻り値。304 の場合は xml が null になる。 */
interface FetchFeedResult {
  xml: string | null;
  etag: string | null;
  lastModified: string | null;
  notModified: boolean;
}

/**
 * 1 回の HTTP fetch を試みる。失敗時は呼び出し元でリトライを判断する。
 * - 4xx (429 除く) は恒久エラーなので Error をそのまま throw
 * - 5xx / 429 / AbortError / ネットワークエラーは throw して呼び出し元がリトライ
 * - 304 Not Modified は notModified=true で返す (リトライしない)
 */
async function fetchFeedOnce(
  url: string,
  timeoutMs: number,
  conditionalHeaders: { etag: string | null; lastModified: string | null },
): Promise<FetchFeedResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const reqHeaders: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/atom+xml, application/rss+xml, application/xml;q=0.9, */*;q=0.5",
    };
    if (conditionalHeaders.etag) {
      reqHeaders["if-none-match"] = conditionalHeaders.etag;
    }
    if (conditionalHeaders.lastModified) {
      reqHeaders["if-modified-since"] = conditionalHeaders.lastModified;
    }

    const res = await fetch(url, {
      headers: reqHeaders,
      signal: controller.signal,
      redirect: "follow",
    });

    // 304: サーバが変更なしと判断。parse/insert をスキップする。
    if (res.status === 304) {
      return { xml: null, etag: null, lastModified: null, notModified: true };
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_FEED_BYTES) {
      throw new Error(`Feed too large: ${contentLength} bytes`);
    }
    const text = await res.text();
    if (text.length > MAX_FEED_BYTES) {
      throw new Error(`Feed body too large: ${text.length} bytes`);
    }

    return {
      xml: text,
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
      notModified: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 一時障害 (5xx / 429 / AbortError / ネットワークエラー) に対して
 * 指数バックオフ + jitter でリトライする。4xx / 304 は即 return。
 * sleep は wallclock のみ消費するため Worker の CPU 制限に影響しない。
 * テスト用に export する
 */
export async function fetchFeed(
  url: string,
  timeoutMs: number,
  maxRetries: number,
  conditionalHeaders: { etag: string | null; lastModified: string | null } = {
    etag: null,
    lastModified: null,
  },
): Promise<FetchFeedResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchFeedOnce(url, timeoutMs, conditionalHeaders);
    } catch (err) {
      lastError = err;

      const isRetryable = isRetryableError(err);

      if (!isRetryable || attempt >= maxRetries) break;

      // base * 2^attempt + jitter(0..base)
      const delayMs = BACKOFF_BASE_MS * 2 ** attempt + Math.random() * BACKOFF_BASE_MS;
      console.warn(
        `[collector] fetchFeed attempt ${attempt + 1} failed for ${url}: ${err instanceof Error ? err.message : String(err)}. Retrying in ${Math.round(delayMs)}ms`,
      );
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function isSafeUrl(url: string): boolean {
  return ALLOWED_URL_PREFIXES.some((p) => url.toLowerCase().startsWith(p));
}

async function collectFeed(
  env: Env,
  feed: FeedConfig,
  summaryMax: number,
  timeoutMs: number,
  maxRetries: number,
): Promise<CollectResult> {
  const fetchedAt = new Date().toISOString();
  const t0 = performance.now();
  try {
    // 前回の conditional GET ヘッダを読み込んでリクエストに付与する
    const savedHeaders = await loadFeedHeaders(env.DB, feed.id);
    const result = await fetchFeed(feed.url, timeoutMs, maxRetries, {
      etag: savedHeaders.last_etag,
      lastModified: savedHeaders.last_modified,
    });

    // 304 Not Modified: parse/insert をスキップし last_fetched_at だけ更新する
    if (result.notModified) {
      await recordFetchSuccess(env.DB, feed.id, fetchedAt, 0, "not_modified");
      writeCollectorEvent(env, {
        feedId: feed.id,
        status: "not_modified",
        ms: Math.round(performance.now() - t0),
        statusCode: 304,
      });
      return { feedId: feed.id, status: "not_modified", inserted: 0, parsed: 0 };
    }

    // 200 OK: レスポンスの ETag / Last-Modified を保存する
    await updateFeedHeaders(env.DB, feed.id, result.etag, result.lastModified);

    const allItems = parseFeed(result.xml!, {
      summaryMaxLength: summaryMax,
      fallbackPublishedAt: fetchedAt,
    });

    const items = allItems.filter((i) => i.url && isSafeUrl(i.url)).slice(0, MAX_ITEMS_PER_FEED);

    const guids = await buildGuids(
      items.map((i) => ({
        feedId: feed.id,
        rawGuid: i.rawGuid,
        url: i.url,
        title: i.title,
        publishedAt: i.publishedAt,
      })),
    );

    const rows: InsertableArticle[] = items.map((item, idx) => ({
      guid: guids[idx],
      feed_id: feed.id,
      title: item.title.slice(0, 500),
      url: item.url!.slice(0, 1000),
      summary: item.summary,
      author: item.author ? item.author.slice(0, 200) : null,
      published_at: item.publishedAt,
      category: feed.category,
      lang: feed.lang,
    }));

    const inserted = await insertArticles(env.DB, rows);
    await recordFetchSuccess(env.DB, feed.id, fetchedAt, inserted);
    writeCollectorEvent(env, {
      feedId: feed.id,
      status: "ok",
      ms: Math.round(performance.now() - t0),
      statusCode: 200,
    });
    return { feedId: feed.id, status: "ok", inserted, parsed: allItems.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await recordFetchError(env.DB, feed.id, fetchedAt, message);
    } catch (logErr) {
      console.error(`Failed to record error for ${feed.id}`, logErr);
    }
    // HTTP エラーコードをメッセージから抽出する (例: "HTTP 503 ...")
    const statusMatch = /^HTTP (\d+)/.exec(message);
    const statusCode = statusMatch ? Number(statusMatch[1]) : 0;
    writeCollectorEvent(env, {
      feedId: feed.id,
      status: "error",
      ms: Math.round(performance.now() - t0),
      statusCode,
    });
    return { feedId: feed.id, status: "error", inserted: 0, parsed: 0, error: message };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function collectAll(env: Env): Promise<CollectAllResult> {
  const start = Date.now();
  const feeds = loadEnabledFeeds();
  await syncFeeds(env.DB, feeds);

  const concurrency = Number(env.COLLECTOR_CONCURRENCY ?? "4") || 4;
  const timeoutMs = Number(env.COLLECTOR_TIMEOUT_MS ?? "10000") || 10000;
  const maxRetries = Number(env.COLLECTOR_RETRIES ?? "2") || 2;
  const summaryMax = Number(env.SUMMARY_MAX_LENGTH ?? "500") || 500;

  const results = await runWithConcurrency(feeds, concurrency, (feed) =>
    collectFeed(env, feed, summaryMax, timeoutMs, maxRetries),
  );

  const inserted = results.reduce((acc, r) => acc + r.inserted, 0);
  const skipped304 = results.filter((r) => r.status === "not_modified").length;

  const retentionDays = Number(env.RETENTION_DAYS ?? "90") || 90;
  let pruned = 0;
  try {
    pruned = await deleteOlderThan(env.DB, retentionDays);
  } catch (err) {
    console.warn(
      `[collector] retention prune failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const durationMs = Date.now() - start;
  console.log(
    `[collector] feeds=${feeds.length} skipped304=${skipped304} inserted=${inserted} pruned=${pruned} retentionDays=${retentionDays} duration=${durationMs}ms`,
  );
  for (const r of results) {
    if (r.status === "error") {
      console.warn(`[collector] ${r.feedId} ERROR: ${r.error}`);
    }
  }
  return { total: feeds.length, inserted, pruned, results, durationMs };
}
