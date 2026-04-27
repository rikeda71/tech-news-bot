import type { FeedConfig } from "@tnb/shared-types";

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
): Promise<void> {
  await db
    .prepare(
      `UPDATE feeds
       SET last_fetched_at = ?1,
           last_status = ?2,
           last_error = NULL,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?3`,
    )
    .bind(fetchedAt, `ok:${insertedCount}`, feedId)
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
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?3`,
    )
    .bind(fetchedAt, error.slice(0, 1000), feedId)
    .run();
}
