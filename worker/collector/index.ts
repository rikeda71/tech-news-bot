import type { Env } from "../types";
import type { FeedConfig } from "../../shared/types";
import { loadEnabledFeeds } from "./feedLoader";
import { parseFeed } from "./rssParser";
import { buildGuids } from "./deduplicator";
import { insertArticles, type InsertableArticle } from "../db/articles";
import { recordFetchError, recordFetchSuccess, syncFeeds } from "../db/feeds";

const MAX_FEED_BYTES = 4 * 1024 * 1024; // 4MB
const MAX_ITEMS_PER_FEED = 50;
const ALLOWED_URL_PREFIXES = ["http://", "https://"];

export interface CollectResult {
  feedId: string;
  status: "ok" | "error";
  inserted: number;
  parsed: number;
  error?: string;
}

export interface CollectAllResult {
  total: number;
  inserted: number;
  results: CollectResult[];
  durationMs: number;
}

const USER_AGENT = "tech-news-bot/0.1 (+https://github.com/rikeda71/tech-news-bot)";

async function fetchFeed(url: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/atom+xml, application/rss+xml, application/xml;q=0.9, */*;q=0.5",
      },
      signal: controller.signal,
      redirect: "follow",
    });
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
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function isSafeUrl(url: string): boolean {
  return ALLOWED_URL_PREFIXES.some((p) => url.toLowerCase().startsWith(p));
}

async function collectFeed(
  env: Env,
  feed: FeedConfig,
  summaryMax: number,
  timeoutMs: number,
): Promise<CollectResult> {
  const fetchedAt = new Date().toISOString();
  try {
    const xml = await fetchFeed(feed.url, timeoutMs);
    const allItems = parseFeed(xml, {
      summaryMaxLength: summaryMax,
      fallbackPublishedAt: fetchedAt,
    });

    const items = allItems
      .filter((i) => i.url && isSafeUrl(i.url))
      .slice(0, MAX_ITEMS_PER_FEED);

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
    return { feedId: feed.id, status: "ok", inserted, parsed: allItems.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await recordFetchError(env.DB, feed.id, fetchedAt, message);
    } catch (logErr) {
      console.error(`Failed to record error for ${feed.id}`, logErr);
    }
    return { feedId: feed.id, status: "error", inserted: 0, parsed: 0, error: message };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
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
  const summaryMax = Number(env.SUMMARY_MAX_LENGTH ?? "500") || 500;

  const results = await runWithConcurrency(feeds, concurrency, (feed) =>
    collectFeed(env, feed, summaryMax, timeoutMs),
  );

  const inserted = results.reduce((acc, r) => acc + r.inserted, 0);
  const durationMs = Date.now() - start;
  console.log(
    `[collector] feeds=${feeds.length} inserted=${inserted} duration=${durationMs}ms`,
  );
  for (const r of results) {
    if (r.status === "error") {
      console.warn(`[collector] ${r.feedId} ERROR: ${r.error}`);
    }
  }
  return { total: feeds.length, inserted, results, durationMs };
}
