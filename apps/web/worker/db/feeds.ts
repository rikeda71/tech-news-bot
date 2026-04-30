import type {
  Article,
  FeedCategory,
  FeedConfig,
  FeedDiagnostic,
  FeedHealth,
  FeedLang,
} from "../types";
import type {
  CategorySummaryDbRow,
  FeedDiagnosticDbRow,
  FeedHealthFeedsDbRow,
  FeedWithStatsDbRow,
} from "./types";

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
 * 複数 feed の conditional GET ヘッダを 1 query でまとめて返す。
 * collectAll では feed ごとに loadFeedHeaders を呼ぶと subrequest を消費するため、
 * Worker の subrequest 上限対策として一括取得する。
 * 該当行が無い feed は Map に含まれず、呼び出し側で null ペアにフォールバックする。
 */
export async function loadFeedHeadersAll(
  db: D1Database,
  feedIds: string[],
): Promise<Map<string, FeedHeaders>> {
  if (feedIds.length === 0) return new Map();
  const placeholders = feedIds.map((_, i) => `?${i + 1}`).join(",");
  const rows = await db
    .prepare(`SELECT id, last_etag, last_modified FROM feeds WHERE id IN (${placeholders})`)
    .bind(...feedIds)
    .all<{ id: string; last_etag: string | null; last_modified: string | null }>();
  const map = new Map<string, FeedHeaders>();
  for (const row of rows.results ?? []) {
    map.set(row.id, { last_etag: row.last_etag, last_modified: row.last_modified });
  }
  return map;
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

  // yaml に存在しない feed を D1 で disable する (orphan cleanup)。
  // 削除しない理由: 過去記事は articles.feed_id 経由で feed 名・カテゴリを引いているため、
  // レコード自体は残し enabled=0 で stats の stale 判定や collector 対象から除外する。
  const ids = feeds.map((f) => f.id);
  const placeholders = ids.map((_, i) => `?${i + 1}`).join(",");
  await db
    .prepare(
      `UPDATE feeds
       SET enabled = 0,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE enabled = 1 AND id NOT IN (${placeholders})`,
    )
    .bind(...ids)
    .run();
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
           last_success_at = ?1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?3`,
    )
    .bind(fetchedAt, status, feedId)
    .run();
}

/** D1 の feeds.enabled を更新する。id が存在しない場合は found=false を返す。 */
export async function setFeedEnabled(
  db: D1Database,
  id: string,
  enabled: boolean,
): Promise<{ found: boolean }> {
  const result = await db
    .prepare(
      `UPDATE feeds
       SET enabled = ?1,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?2`,
    )
    .bind(enabled ? 1 : 0, id)
    .run();
  return { found: (result.meta.changes ?? 0) > 0 };
}

export async function countFeeds(db: D1Database, opts?: { enabled?: boolean }): Promise<number> {
  if (opts?.enabled === undefined) {
    const row = await db.prepare(`SELECT COUNT(*) AS c FROM feeds`).first<{ c: number }>();
    return row?.c ?? 0;
  }
  const row = await db
    .prepare(`SELECT COUNT(*) AS c FROM feeds WHERE enabled = ?1`)
    .bind(opts.enabled ? 1 : 0)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

/** D1 で enabled=1 の feed id を Set で返す。collector での in-memory check 用。 */
export async function getEnabledFeedIds(db: D1Database): Promise<Set<string>> {
  const rows = await db.prepare(`SELECT id FROM feeds WHERE enabled = 1`).all<{ id: string }>();
  return new Set(rows.results.map((r) => r.id));
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
           last_failure_at = ?1,
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

export interface FeedWithStats {
  id: string;
  name: string;
  url: string;
  category: FeedCategory;
  lang: FeedLang;
  enabled: boolean;
  articles_30d: number;
  last_published_at: string | null;
}

export interface ListFeedsWithStatsOpts {
  category?: FeedCategory;
  lang?: FeedLang;
  enabled?: boolean;
}

/**
 * feeds テーブルに articles の 30d 集計を JOIN して返す。
 * フィルタ条件は opts で渡し、WHERE 句を動的に構築する。
 * 並び順は id ASC で統一 (管理 UI や API の一貫性のため)。
 */
export async function listFeedsWithStats(
  db: D1Database,
  opts?: ListFeedsWithStatsOpts,
): Promise<FeedWithStats[]> {
  const conds: string[] = [];
  const binds: unknown[] = [];

  if (opts?.category !== undefined) {
    binds.push(opts.category);
    conds.push(`f.category = ?${binds.length}`);
  }
  if (opts?.lang !== undefined) {
    binds.push(opts.lang);
    conds.push(`f.lang = ?${binds.length}`);
  }
  if (opts?.enabled !== undefined) {
    binds.push(opts.enabled ? 1 : 0);
    conds.push(`f.enabled = ?${binds.length}`);
  }

  // 30d 境界を SQLite の datetime 関数で計算し bind する
  const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  binds.push(threshold);
  const thresholdIdx = binds.length;

  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";

  const sql = `
    SELECT f.id,
           f.name,
           f.url,
           f.category,
           f.lang,
           f.enabled,
           COUNT(CASE WHEN a.published_at >= ?${thresholdIdx} THEN 1 END) AS articles_30d,
           MAX(a.published_at) AS last_published_at
    FROM feeds f
    LEFT JOIN articles a ON a.feed_id = f.id
    ${where}
    GROUP BY f.id, f.name, f.url, f.category, f.lang, f.enabled
    ORDER BY f.id ASC
  `;

  const rows = await db
    .prepare(sql)
    .bind(...binds)
    .all<FeedWithStatsDbRow>();

  return (rows.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    category: r.category as FeedCategory,
    lang: r.lang as FeedLang,
    enabled: r.enabled === 1,
    articles_30d: r.articles_30d,
    last_published_at: r.last_published_at,
  }));
}

/**
 * 1 件のフィードを articles 集計付きで返す。
 * id が存在しない場合は null。
 */
export async function findFeedWithStats(db: D1Database, id: string): Promise<FeedWithStats | null> {
  const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const row = await db
    .prepare(
      `SELECT f.id, f.name, f.url, f.category, f.lang, f.enabled,
              COUNT(CASE WHEN a.published_at >= ?2 THEN 1 END) AS articles_30d,
              MAX(a.published_at) AS last_published_at
       FROM feeds f
       LEFT JOIN articles a ON a.feed_id = f.id
       WHERE f.id = ?1
       GROUP BY f.id, f.name, f.url, f.category, f.lang, f.enabled`,
    )
    .bind(id, threshold)
    .first<FeedWithStatsDbRow>();

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    url: row.url,
    category: row.category as FeedCategory,
    lang: row.lang as FeedLang,
    enabled: row.enabled === 1,
    articles_30d: row.articles_30d,
    last_published_at: row.last_published_at,
  };
}

export interface CategorySummary {
  id: FeedCategory;
  label: string;
  feeds_count: number;
  articles_30d: number;
  last_published_at: string | null;
}

const ALL_CATEGORIES: FeedCategory[] = ["bigtech", "ai", "jp", "personal"];

// client 側の CategorySummary.label に対応するマッピング
const CATEGORY_LABELS: Record<FeedCategory, string> = {
  bigtech: "ビッグテック",
  ai: "AI",
  jp: "日本企業",
  personal: "個人ブログ",
};

/**
 * カテゴリ別のサマリを 1 クエリで取得する。
 * feeds テーブルに articles を LEFT JOIN して GROUP BY category。
 * D1 の結果に含まれないカテゴリ (フィード 0 件) は TS 側で 0 埋めして必ず 4 件返す。
 * client 側の CategorySummary 型に合わせて id / label を返す。
 */
export async function getCategoriesSummary(db: D1Database): Promise<CategorySummary[]> {
  const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const rows = await db
    .prepare(
      `SELECT f.category,
              COUNT(DISTINCT f.id) AS feeds_count,
              COUNT(CASE WHEN a.published_at >= ?1 THEN 1 END) AS articles_30d,
              MAX(a.published_at) AS last_published_at
       FROM feeds f
       LEFT JOIN articles a ON a.feed_id = f.id
       GROUP BY f.category`,
    )
    .bind(threshold)
    .all<CategorySummaryDbRow>();

  const dbMap = new Map(
    (rows.results ?? []).map((r) => {
      const id = r.category as CategorySummary["id"];
      return [
        id,
        {
          id,
          label: CATEGORY_LABELS[id],
          feeds_count: r.feeds_count,
          articles_30d: r.articles_30d,
          last_published_at: r.last_published_at,
        },
      ];
    }),
  );

  // DB に存在しないカテゴリも 0 埋めして全 4 カテゴリを返す
  return ALL_CATEGORIES.map(
    (cat) =>
      dbMap.get(cat) ?? {
        id: cat,
        label: CATEGORY_LABELS[cat],
        feeds_count: 0,
        articles_30d: 0,
        last_published_at: null,
      },
  );
}

/**
 * 全フィードの運用診断情報を 1 クエリで返す。
 * feeds テーブルの全カラム + articles の累積件数・30d 件数・最終公開日時を JOIN する。
 * enabled の有無に関わらず全フィードを返す (運用ダッシュボード用)。
 */
export async function getFeedsDiagnostics(db: D1Database): Promise<FeedDiagnostic[]> {
  const threshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const rows = await db
    .prepare(
      `SELECT f.id,
              f.name,
              f.url,
              f.category,
              f.lang,
              f.enabled,
              f.last_fetched_at,
              f.last_status,
              f.last_error,
              f.last_etag,
              f.last_modified,
              f.consecutive_failures AS fetch_error_count,
              COUNT(a.id) AS articles_total,
              COUNT(CASE WHEN a.published_at >= ?1 THEN 1 END) AS articles_30d,
              MAX(a.published_at) AS last_published_at
       FROM feeds f
       LEFT JOIN articles a ON a.feed_id = f.id
       GROUP BY f.id, f.name, f.url, f.category, f.lang, f.enabled,
                f.last_fetched_at, f.last_status, f.last_error,
                f.last_etag, f.last_modified, f.consecutive_failures
       ORDER BY f.id ASC`,
    )
    .bind(threshold)
    .all<FeedDiagnosticDbRow>();

  return (rows.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    category: r.category as FeedCategory,
    lang: r.lang as FeedLang,
    enabled: r.enabled === 1,
    last_fetched_at: r.last_fetched_at,
    last_status: r.last_status,
    last_error: r.last_error,
    last_etag: r.last_etag,
    last_modified: r.last_modified,
    fetch_error_count: r.fetch_error_count,
    articles_total: r.articles_total,
    articles_30d: r.articles_30d,
    last_published_at: r.last_published_at,
  }));
}

/**
 * 指定フィードの最近の記事を published_at 降順で返す。
 * db/articles.ts への変更を避けるため feeds.ts 内に定義。
 */
export async function getRecentArticlesByFeed(
  db: D1Database,
  feedId: string,
  limit: number,
): Promise<Article[]> {
  const rows = await db
    .prepare(
      `SELECT a.id, a.guid, a.feed_id, f.name AS feed_name, a.title, a.url, a.summary,
              a.author, a.published_at, a.fetched_at, a.category, a.lang
       FROM articles a
       LEFT JOIN feeds f ON f.id = a.feed_id
       WHERE a.feed_id = ?1
       ORDER BY a.published_at DESC
       LIMIT ?2`,
    )
    .bind(feedId, limit)
    .all<Article>();

  return rows.results ?? [];
}

/**
 * feeds テーブルと articles テーブルを JOIN して /api/feeds/health 用の集計を返す。
 * 1 クエリで完結させ D1 の 50ms CPU 制約に収める。
 */
export async function getFeedHealth(db: D1Database, feeds: FeedConfig[]): Promise<FeedHealth[]> {
  if (feeds.length === 0) return [];

  const rows = await db
    .prepare(
      `SELECT f.id,
              f.last_success_at,
              f.last_failure_at,
              f.consecutive_failures,
              COUNT(a.id) AS articles_last_7d
       FROM feeds f
       LEFT JOIN articles a
         ON a.feed_id = f.id
        AND a.published_at >= datetime('now', '-7 days')
       GROUP BY f.id`,
    )
    .all<FeedHealthFeedsDbRow>();

  const dbMap = new Map(rows.results.map((r) => [r.id, r]));

  return feeds.map((f) => {
    const row = dbMap.get(f.id);
    return {
      feed_id: f.id,
      feed_name: f.name,
      enabled: f.enabled,
      last_success_at: row?.last_success_at ?? null,
      last_failure_at: row?.last_failure_at ?? null,
      consecutive_failures: row?.consecutive_failures ?? 0,
      articles_last_7d: row?.articles_last_7d ?? 0,
    };
  });
}
