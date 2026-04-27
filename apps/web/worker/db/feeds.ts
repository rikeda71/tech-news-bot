import type { FeedConfig } from "../types";

export interface FeedHeaders {
  last_etag: string | null;
  last_modified: string | null;
}

/** 前回保存した conditional GET ヘッダを返す。未取得 feed は null ペアを返す。*/
export async function loadFeedHeaders(db: D1Database, feedId: string): Promise<FeedHeaders> {
  const row = await db
    .prepare(`SELECT last_etag, last_modified FROM feeds WHERE id = ?1`)
    .bind(feedId)
    .first<FeedHeaders>();
  return row ?? { last_etag: null, last_modified: null };
}

/**
 * 200 応答時のレスポンスヘッダを保存する。
 * null を渡すと既存値を NULL 上書きする (サーバが ETag を返さなくなった場合)。
 */
export async function updateFeedHeaders(
  db: D1Database,
  feedId: string,
  etag: string | null,
  lastModified: string | null,
): Promise<void> {
  await db
    .prepare(
      `UPDATE feeds
       SET last_etag = ?1,
           last_modified = ?2,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?3`,
    )
    .bind(etag, lastModified, feedId)
    .run();
}

export async function syncFeeds(db: D1Database, feeds: FeedConfig[]): Promise<void> {
  if (feeds.length === 0) return;
  const stmts = feeds.map((f) =>
    db
      .prepare(
        `INSERT INTO feeds (id, name, url, category, lang, enabled, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           url = excluded.url,
           category = excluded.category,
           lang = excluded.lang,
           enabled = excluded.enabled,
           updated_at = excluded.updated_at`,
      )
      .bind(f.id, f.name, f.url, f.category, f.lang, f.enabled ? 1 : 0),
  );
  const BATCH_SIZE = 50;
  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    await db.batch(stmts.slice(i, i + BATCH_SIZE));
  }
}

export async function recordFetchSuccess(
  db: D1Database,
  feedId: string,
  fetchedAt: string,
  insertedCount: number,
  // 304 の場合は "not_modified"、それ以外は挿入件数を含む "ok:N" 形式
  statusOverride?: "not_modified",
): Promise<void> {
  const status = statusOverride ?? `ok:${insertedCount}`;
  await db
    .prepare(
      `UPDATE feeds
       SET last_fetched_at = ?1,
           last_status = ?2,
           last_error = NULL,
           consecutive_failures = 0,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?3`,
    )
    .bind(fetchedAt, status, feedId)
    .run();
}

export async function recordFetchError(
  db: D1Database,
  feedId: string,
  fetchedAt: string,
  error: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE feeds
       SET last_fetched_at = ?1,
           last_status = 'error',
           last_error = ?2,
           consecutive_failures = consecutive_failures + 1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?3`,
    )
    .bind(fetchedAt, error.slice(0, 1000), feedId)
    .run();
}

export interface FeedStreak {
  id: string;
  consecutive_failures: number;
}

/** enabled なフィードの連続失敗カウントを返す。アラート判定に使用する。 */
export async function getFeedStreaks(db: D1Database): Promise<FeedStreak[]> {
  const result = await db
    .prepare(`SELECT id, consecutive_failures FROM feeds WHERE enabled = 1`)
    .all<FeedStreak>();
  return result.results;
}
