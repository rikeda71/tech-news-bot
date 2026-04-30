import type { Env, FeedConfig } from "../types";
import { parseFeed } from "./rssParser";
import { buildGuids } from "./deduplicator";
import { D1CostAccumulator, writeCollectorEvent } from "./metrics";
import {
  buildInsertArticleStmts,
  findExistingArticleGuids,
  type InsertableArticle,
} from "../db/articles";
import {
  buildRecordFetchErrorStmt,
  buildRecordFetchSuccessStmt,
  buildUpdateFeedHeadersStmt,
  type FeedHeaders,
} from "../db/feeds";
import { buildRecordRunFeedStmt } from "../db/runs";
import { classifyError, type CollectResult } from "./collectTypes";
import { fetchFeed } from "./fetcher";

const MAX_ITEMS_PER_FEED = 50;
const ALLOWED_URL_PREFIXES = ["http://", "https://"];

function isSafeUrl(url: string): boolean {
  return ALLOWED_URL_PREFIXES.some((p) => url.toLowerCase().startsWith(p));
}

/**
 * 304 Not Modified パス: last_fetched_at だけ更新して "not_modified" を返す。
 * batch stmts を組み立てて env.DB.batch() を呼ぶ。
 */
export async function handleNotModified(
  env: Env,
  feedId: string,
  fetchedAt: string,
  runId: number | null,
  feedStart: number,
  t0: number,
  d1Acc: D1CostAccumulator,
): Promise<CollectResult> {
  const stmts: D1PreparedStatement[] = [
    buildRecordFetchSuccessStmt(env.DB, feedId, fetchedAt, 0, "not_modified"),
  ];
  if (runId !== null) {
    stmts.push(buildRecordRunFeedStmt(env.DB, runId, feedId, "skipped", 0, Date.now() - feedStart));
  }
  const batchResults = await env.DB.batch(stmts);
  for (const r of batchResults) d1Acc.add(r.meta);
  writeCollectorEvent(env, {
    feedId,
    status: "not_modified",
    ms: Math.round(performance.now() - t0),
    statusCode: 304,
  });
  return { feedId, status: "not_modified", inserted: 0, parsed: 0 };
}

/**
 * 200 OK パス: XML パース → 重複排除 → INSERT batch → fetchSuccess 記録。
 * SELECT existing guids (1 subrequest) + batch (1 subrequest) の計 2 を消費する。
 */
export async function handleSuccess(
  env: Env,
  feed: FeedConfig,
  xml: string,
  etag: string | null,
  lastModified: string | null,
  fetchedAt: string,
  summaryMax: number,
  runId: number | null,
  feedStart: number,
  t0: number,
  d1Acc: D1CostAccumulator,
): Promise<CollectResult> {
  const allItems = parseFeed(xml, {
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

  // FTS トリガが INSERT OR IGNORE の changes() を変動させるため事前に既存 guid を引いて
  // 新規行のみ INSERT する。SELECT は 1 subrequest だが per-feed batch とは独立して実行する。
  const existingSet = await findExistingArticleGuids(
    env.DB,
    rows.map((r) => r.guid),
  );
  const newRows = rows.filter((r) => !existingSet.has(r.guid));
  const inserted = newRows.length;

  // header 更新 + INSERT 群 + recordFetchSuccess + recordRunFeed を 1 batch に集約。
  // MAX_ITEMS_PER_FEED=50 + 3 = 53 stmts なので D1 batch 上限 100 を超えない。
  const stmts: D1PreparedStatement[] = [
    buildUpdateFeedHeadersStmt(env.DB, feed.id, etag, lastModified),
    ...buildInsertArticleStmts(env.DB, newRows),
    buildRecordFetchSuccessStmt(env.DB, feed.id, fetchedAt, inserted),
  ];
  if (runId !== null) {
    stmts.push(
      buildRecordRunFeedStmt(env.DB, runId, feed.id, "ok", inserted, Date.now() - feedStart),
    );
  }
  const batchResults = await env.DB.batch(stmts);
  for (const r of batchResults) d1Acc.add(r.meta);

  writeCollectorEvent(env, {
    feedId: feed.id,
    status: "ok",
    ms: Math.round(performance.now() - t0),
    statusCode: 200,
  });
  return { feedId: feed.id, status: "ok", inserted, parsed: allItems.length };
}

/**
 * エラーパス: fetchError を記録して "error" 結果を返す。
 * batch (1 subrequest) を消費する。
 */
export async function handleError(
  env: Env,
  feedId: string,
  err: unknown,
  fetchedAt: string,
  runId: number | null,
  feedStart: number,
  t0: number,
  d1Acc: D1CostAccumulator,
): Promise<CollectResult> {
  const message = err instanceof Error ? err.message : String(err);
  const errorKind = classifyError(err);
  try {
    const stmts: D1PreparedStatement[] = [
      buildRecordFetchErrorStmt(env.DB, feedId, fetchedAt, message),
    ];
    if (runId !== null) {
      stmts.push(
        buildRecordRunFeedStmt(env.DB, runId, feedId, "failed", 0, Date.now() - feedStart, message),
      );
    }
    const batchResults = await env.DB.batch(stmts);
    for (const r of batchResults) d1Acc.add(r.meta);
  } catch (logErr) {
    console.error(`Failed to record error for ${feedId}`, logErr);
  }
  // HTTP エラーコードをメッセージから抽出する (例: "HTTP 503 ...")
  const statusMatch = /^HTTP (\d+)/.exec(message);
  const statusCode = statusMatch ? Number(statusMatch[1]) : 0;
  writeCollectorEvent(env, {
    feedId,
    status: "error",
    ms: Math.round(performance.now() - t0),
    statusCode,
  });
  return {
    feedId,
    status: "error",
    inserted: 0,
    parsed: 0,
    error: message,
    errorKind,
  };
}

/**
 * 1 feed 分の収集。per-feed の D1 書き込みを 1 batch にまとめて
 * Worker の subrequest 上限を圧迫しないようにする。
 *
 * Subrequest 内訳 (Cloudflare Workers の subrequest 上限対策):
 * - 304:    fetch (1) + batch[recordFetchSuccess + recordRunFeed?] (1) = 2
 * - 200:    fetch (1) + SELECT existing guids (1) + batch[updateHeaders + INSERTs + recordFetchSuccess + recordRunFeed?] (1) = 3
 * - error:  fetch (1) + batch[recordFetchError + recordRunFeed?] (1) = 2
 *
 * runId が null なら recordRunFeed は省略 (テスト等で run tracking 無効時)。
 */
export async function collectFeed(
  env: Env,
  feed: FeedConfig,
  savedHeaders: FeedHeaders,
  summaryMax: number,
  timeoutMs: number,
  maxRetries: number,
  runId: number | null,
  d1Acc: D1CostAccumulator,
): Promise<CollectResult> {
  const fetchedAt = new Date().toISOString();
  const t0 = performance.now();
  const feedStart = Date.now();
  try {
    // savedHeaders は collectAll 冒頭で全 enabled feed 分を 1 query でまとめて取得済み。
    // feed あたり 1 read を消費しないので Worker の subrequest 上限対策になる。
    const result = await fetchFeed(feed.url, timeoutMs, maxRetries, {
      etag: savedHeaders.last_etag,
      lastModified: savedHeaders.last_modified,
    });

    // 304 Not Modified: parse/insert をスキップし last_fetched_at だけ更新する
    if (result.notModified) {
      return handleNotModified(env, feed.id, fetchedAt, runId, feedStart, t0, d1Acc);
    }

    // 200 OK path
    return handleSuccess(
      env,
      feed,
      result.xml!,
      result.etag,
      result.lastModified,
      fetchedAt,
      summaryMax,
      runId,
      feedStart,
      t0,
      d1Acc,
    );
  } catch (err) {
    return handleError(env, feed.id, err, fetchedAt, runId, feedStart, t0, d1Acc);
  }
}
