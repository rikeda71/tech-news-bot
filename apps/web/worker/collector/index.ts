import type { Env, FeedConfig } from "../types";
import { loadEnabledFeeds } from "../feed-config";
import { parseFeed } from "./rssParser";
import { parseXml, pickText, asArray } from "../utils/xml";
import { checkUrlSafety } from "./url-safety";
import { buildGuids } from "./deduplicator";
import { D1CostAccumulator, writeCollectorEvent, writeD1CostEvent } from "./metrics";
import { maybeAlert, sendAlert } from "./alert";
import { insertArticles, type InsertableArticle } from "../db/articles";
import {
  type FeedHeaders,
  getEnabledFeedIds,
  getFeedStreaks,
  loadFeedHeadersAll,
  recordFetchError,
  recordFetchSuccess,
  syncFeeds,
  updateFeedHeaders,
} from "../db/feeds";
import { finishRun, recordRunFeed, startRun } from "../db/runs";

const MAX_FEED_BYTES = 4 * 1024 * 1024; // 4MB
const MAX_ITEMS_PER_FEED = 50;
const ALLOWED_URL_PREFIXES = ["http://", "https://"];
// backoff: 500ms, 1000ms の 2 回まで。並列度 4 × max 1.5s = 6s < 30s cron 制限
const BACKOFF_BASE_MS = 500;

/**
 * エラーの種別。alert や監視ダッシュボードでエラーをフィルタリングできるよう型で区別する。
 * - timeout: AbortError (fetchFeed のタイムアウト)
 * - network: TypeError (DNS 解決失敗・接続拒否など)
 * - http_client: HTTP 4xx (404, 403 など恒久エラー)
 * - http_server: HTTP 5xx / 429 (一時障害。リトライ後も失敗した場合)
 * - parse: XML パース失敗または空フィード
 * - unknown: 上記に分類できないエラー
 */
export type CollectErrorKind =
  | "timeout"
  | "network"
  | "http_client"
  | "http_server"
  | "parse"
  | "unknown";

/** discriminated union: status に応じて error / errorKind フィールドの有無が変わる */
export type CollectResult =
  | { feedId: string; status: "ok"; inserted: number; parsed: number }
  | { feedId: string; status: "not_modified"; inserted: number; parsed: number }
  | {
      feedId: string;
      status: "error";
      inserted: number;
      parsed: number;
      error: string;
      errorKind: CollectErrorKind;
    };

/**
 * 例外からエラー種別を分類する。
 * isRetryableError と対になる分類で、同じ判定ロジックを使う。
 */
export function classifyError(err: unknown): CollectErrorKind {
  if (!(err instanceof Error)) return "unknown";
  if (err.name === "AbortError") return "timeout";
  if (err instanceof TypeError) return "network";
  const m = /^HTTP (\d+)/.exec(err.message);
  if (m) {
    const code = Number(m[1]);
    if (code === 429 || (code >= 500 && code < 600)) return "http_server";
    if (code >= 400 && code < 500) return "http_client";
  }
  return "unknown";
}

export interface CollectAllResult {
  total: number;
  inserted: number;
  pruned: number;
  results: CollectResult[];
  durationMs: number;
}

// 一部のブログ (mercari-engineering 等) は WAF が "bot" 名を含む UA を 403 で弾くため、
// Mozilla 互換プレフィックスを付ける。Feedly / NewsBlur など主要 RSS リーダも同様の手法。
const USER_AGENT =
  "Mozilla/5.0 (compatible; tech-news-bot/0.1; +https://github.com/rikeda71/tech-news-bot)";

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
  savedHeaders: FeedHeaders,
  summaryMax: number,
  timeoutMs: number,
  maxRetries: number,
): Promise<CollectResult> {
  const fetchedAt = new Date().toISOString();
  const t0 = performance.now();
  try {
    // savedHeaders は collectAll 冒頭で全 enabled feed 分を 1 query でまとめて取得済み。
    // feed あたり 1 read を消費しないので Worker の subrequest 上限対策になる。
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
    const errorKind = classifyError(err);
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
    return {
      feedId: feed.id,
      status: "error",
      inserted: 0,
      parsed: 0,
      error: message,
      errorKind,
    };
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

export type ValidateFeedResult =
  | { ok: true; title: string; lang: string | null; item_count: number }
  | { ok: false; error: string };

/**
 * URL を fetch + parse して RSS/Atom として有効かどうかを検証する。
 * feeds.yaml に追記する前の事前確認用。DB アクセスは行わない。
 * タイムアウトは 10s (admin endpoint 側で 12s でラップする)。
 * SSRF 対策として内部 IP / 特殊用途ホストへのアクセスは事前にブロックする。
 */
export async function validateFeedUrl(url: string): Promise<ValidateFeedResult> {
  // fetch より前に SSRF チェックを行い、内部 IP やプライベートホストを拒否する
  const safety = checkUrlSafety(url);
  if (!safety.ok) {
    return { ok: false, error: `unsafe URL: ${safety.reason}` };
  }

  let result: Awaited<ReturnType<typeof fetchFeed>>;
  try {
    // retry なし (検証用なので 1 回で判断する)
    result = await fetchFeed(url, 10_000, 0);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (result.notModified || result.xml === null) {
    // 304 は通常ありえないが念のため
    return { ok: false, error: "unexpected 304 Not Modified" };
  }

  const root = parseXml(result.xml) as Record<string, unknown>;
  if (!root || typeof root !== "object") {
    return { ok: false, error: "failed to parse XML" };
  }

  // RSS 2.0 / RDF 1.0
  const rss = root["rss"] as Record<string, unknown> | undefined;
  const rdf = root["rdf:RDF"] as Record<string, unknown> | undefined;
  const atomFeed = root["feed"] as Record<string, unknown> | undefined;

  if (rss) {
    const channel = rss["channel"] as Record<string, unknown> | undefined;
    if (!channel) return { ok: false, error: "RSS feed has no <channel>" };
    const title = pickText(channel["title"]) ?? "";
    if (!title) return { ok: false, error: "RSS feed has no <title>" };
    const lang = pickText(channel["language"]) ?? null;
    const items = asArray(
      channel["item"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
    );
    return { ok: true, title, lang, item_count: items.length };
  }

  if (rdf) {
    // RDF 1.0: channel は rdf:RDF/channel
    const channel = rdf["channel"] as Record<string, unknown> | undefined;
    const title = pickText(channel?.["title"]) ?? "";
    if (!title) return { ok: false, error: "RDF feed has no <title>" };
    const lang = pickText(channel?.["language"]) ?? null;
    const items = asArray(
      rdf["item"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
    );
    return { ok: true, title, lang, item_count: items.length };
  }

  if (atomFeed) {
    const title = pickText(atomFeed["title"]) ?? "";
    if (!title) return { ok: false, error: "Atom feed has no <title>" };
    // Atom の言語は xml:lang 属性 (@_xml:lang) で表現されることが多い
    const lang =
      pickText(atomFeed["language"]) ?? (atomFeed["@_xml:lang"] as string | undefined) ?? null;
    const entries = asArray(
      atomFeed["entry"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
    );
    return { ok: true, title, lang, item_count: entries.length };
  }

  return { ok: false, error: "not a valid RSS or Atom feed" };
}

export async function collectAll(
  env: Env,
  opts?: { runId?: number; feedIds?: readonly string[]; source?: "cron" | "manual" },
): Promise<CollectAllResult> {
  const start = Date.now();
  const startedAt = new Date(start).toISOString();
  const feeds = loadEnabledFeeds();
  await syncFeeds(env.DB, feeds);

  // yaml の enabled=true を前提に、D1 で runtime disabled にされた feed を除外する。
  // feedIds が指定された場合はその ID に含まれるものだけを対象にする。
  const d1EnabledIds = await getEnabledFeedIds(env.DB);
  const activeFeeds = feeds.filter((f) => {
    if (!d1EnabledIds.has(f.id)) return false;
    if (opts?.feedIds !== undefined) return opts.feedIds.includes(f.id);
    return true;
  });

  const concurrency = Number(env.COLLECTOR_CONCURRENCY ?? "4") || 4;
  const timeoutMs = Number(env.COLLECTOR_TIMEOUT_MS ?? "10000") || 10000;
  // 0 (リトライ無効) を許容するため `|| 2` フォールバックは使わず NaN/負数のみデフォルトに落とす。
  const maxRetriesRaw = Number(env.COLLECTOR_RETRIES ?? "2");
  const maxRetries = Number.isFinite(maxRetriesRaw) && maxRetriesRaw >= 0 ? maxRetriesRaw : 2;
  const summaryMax = Number(env.SUMMARY_MAX_LENGTH ?? "500") || 500;

  const d1Acc = new D1CostAccumulator();

  // run_id が外から渡された場合はそれを使い、渡されなければここで startRun する
  let runId: number | null = opts?.runId ?? null;
  if (runId === null) {
    try {
      const { run_id, d1Meta } = await startRun(env.DB, startedAt, activeFeeds.length);
      runId = run_id;
      d1Acc.add(d1Meta);
    } catch (err) {
      console.error(
        `[collector] startRun failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const headersMap = await loadFeedHeadersAll(
    env.DB,
    activeFeeds.map((f) => f.id),
  );
  const emptyHeaders: FeedHeaders = { last_etag: null, last_modified: null };

  const results = await runWithConcurrency(activeFeeds, concurrency, async (feed) => {
    const feedStart = Date.now();
    const result = await collectFeed(
      env,
      feed,
      headersMap.get(feed.id) ?? emptyHeaders,
      summaryMax,
      timeoutMs,
      maxRetries,
    );
    const durationMs = Date.now() - feedStart;

    // 各フィードの結果を記録する。失敗しても collectFeed の結果は返す。
    if (runId !== null) {
      const status =
        result.status === "error" ? "failed" : result.status === "not_modified" ? "skipped" : "ok";
      try {
        const meta = await recordRunFeed(
          env.DB,
          runId,
          feed.id,
          status,
          result.inserted,
          durationMs,
          result.status === "error" ? result.error : undefined,
        );
        d1Acc.add(meta);
      } catch (err) {
        console.error(
          `[collector] recordRunFeed(${feed.id}) failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return result;
  });

  const inserted = results.reduce((acc, r) => acc + r.inserted, 0);
  const skipped304 = results.filter((r) => r.status === "not_modified").length;
  const feedsOk = results.filter((r) => r.status === "ok" || r.status === "not_modified").length;
  const feedsFailed = results.filter((r) => r.status === "error").length;

  const durationMs = Date.now() - start;
  const completedAt = new Date(Date.now()).toISOString();

  // run の完了を記録する
  if (runId !== null) {
    try {
      const meta = await finishRun(env.DB, runId, completedAt, feedsOk, feedsFailed, inserted);
      d1Acc.add(meta);
    } catch (err) {
      console.error(
        `[collector] finishRun failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const source = opts?.source ?? "cron";
  console.log(
    `[collector] source=${source} feeds=${activeFeeds.length} skipped304=${skipped304} inserted=${inserted} duration=${durationMs}ms`,
  );

  // D1 コスト集計を AE に送信する (best-effort)
  try {
    const d1Stats = d1Acc.toStats();
    writeD1CostEvent(env, {
      rowsRead: d1Stats.rowsRead,
      rowsWritten: d1Stats.rowsWritten,
      durationTotalMs: d1Stats.durationTotalMs,
      feedsCount: activeFeeds.length,
      articlesInserted: inserted,
    });
  } catch (err) {
    console.warn(
      `[collector] writeD1CostEvent failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // feedId → url のマップを作り、失敗ログに URL と errorKind を含める。
  // wrangler tail で直接問題 URL を確認できるようにするため。
  const feedUrlMap = new Map(activeFeeds.map((f) => [f.id, f.url]));
  for (const r of results) {
    if (r.status === "error") {
      const url = feedUrlMap.get(r.feedId) ?? "(unknown)";
      console.warn(`[collector] ${r.feedId} ERROR kind=${r.errorKind} url=${url}: ${r.error}`);
    }
  }

  // ALERT_WEBHOOK_URL が未設定なら D1 クエリも含めて全スキップ
  if (env.ALERT_WEBHOOK_URL) {
    const minFailures = Number(env.ALERT_MIN_FAILURES ?? "3") || 3;
    const feedStreak = Number(env.ALERT_FEED_STREAK ?? "5") || 5;
    try {
      const streaks = await getFeedStreaks(env.DB);
      await maybeAlert(env.ALERT_WEBHOOK_URL, results, streaks, minFailures, feedStreak);
    } catch (err) {
      console.error(
        `[collector] alert check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // retention は scheduled() の pruneOldArticles に一本化しているため、ここでは常に 0
  const finalResult = { total: activeFeeds.length, inserted, pruned: 0, results, durationMs };

  // COLLECTOR_ALERT_WEBHOOK ベースのシンプルな閾値アラート (best-effort)
  try {
    await sendAlert(env, finalResult);
  } catch (err) {
    console.error(
      `[collector] sendAlert failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return finalResult;
}

/**
 * 特定の feed_ids のみを対象に収集する。admin 手動トリガー用。
 * collectAll の薄いラッパー。run tracking (collector_runs) も有効。
 * - feedIds 未指定時は全 enabled feed を対象にする
 * - feedIds 指定時は enabled かつ指定 ID に含まれるものだけを対象にする
 */
export async function collectFeeds(env: Env, feedIds?: string[]): Promise<CollectAllResult> {
  return collectAll(env, { source: "manual", feedIds });
}
