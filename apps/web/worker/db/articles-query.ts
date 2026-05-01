import type { Article, FeedCategory, FeedLang } from "../types";
import {
  ARTICLES_BARE_FIELDS,
  ARTICLES_FROM_JOIN,
  ARTICLES_SELECT_FIELDS,
  type CursorPage,
  type Cursor,
  buildPaginatedQuery,
  extractWithCursor,
} from "./articles-cursor";
import { escapeFtsQuery } from "./articles-query-extra";
import type { D1BindParameter } from "./types";

// ---------------------------------------------------------------------------
// 単純 read 系
// ---------------------------------------------------------------------------

export async function getArticleById(db: D1Database, id: number): Promise<Article | null> {
  const result = await db
    .prepare(
      `SELECT ${ARTICLES_SELECT_FIELDS}
       ${ARTICLES_FROM_JOIN}
       WHERE a.id = ?1
       LIMIT 1`,
    )
    .bind(id)
    .first<Article>();
  return result ?? null;
}

export async function findArticleByGuid(db: D1Database, guid: string): Promise<Article | null> {
  const result = await db
    .prepare(
      `SELECT ${ARTICLES_SELECT_FIELDS}
       ${ARTICLES_FROM_JOIN}
       WHERE a.guid = ?1
       LIMIT 1`,
    )
    .bind(guid)
    .first<Article>();
  return result ?? null;
}

// ---------------------------------------------------------------------------
// listArticles
// ---------------------------------------------------------------------------

export interface ListArticlesParams {
  category?: FeedCategory;
  lang?: FeedLang;
  feedId?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  cursor?: Cursor | null;
}

export interface ListArticlesResult {
  articles: Article[];
  nextCursor: Cursor | null;
}

export async function listArticles(
  db: D1Database,
  params: ListArticlesParams,
): Promise<ListArticlesResult> {
  const limit = Math.min(Math.max(params.limit, 1), 100);
  const conds: string[] = [];
  const binds: D1BindParameter[] = [];

  if (params.category) {
    conds.push(`a.category = ?${binds.length + 1}`);
    binds.push(params.category);
  }
  if (params.lang) {
    conds.push(`a.lang = ?${binds.length + 1}`);
    binds.push(params.lang);
  }
  if (params.feedId) {
    conds.push(`a.feed_id = ?${binds.length + 1}`);
    binds.push(params.feedId);
  }
  if (params.dateFrom) {
    conds.push(`a.published_at >= ?${binds.length + 1}`);
    binds.push(params.dateFrom);
  }
  if (params.dateTo) {
    conds.push(`a.published_at <= ?${binds.length + 1}`);
    binds.push(params.dateTo);
  }
  // FTS5 条件は cursor より前に追加 (cursor は appendCursorCondition で末尾に付く)
  if (params.q && params.q.trim()) {
    conds.push(
      `a.id IN (SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?${binds.length + 1})`,
    );
    binds.push(escapeFtsQuery(params.q.trim()));
  }

  const { sql, binds: finalBinds } = buildPaginatedQuery({
    baseConds: conds,
    baseBinds: binds,
    limit,
    cursor: params.cursor,
  });

  const result = await db
    .prepare(sql)
    .bind(...finalBinds)
    .all<Article>();
  return extractWithCursor(result.results ?? [], limit);
}

// ---------------------------------------------------------------------------
// getRandomArticles
// ---------------------------------------------------------------------------

export interface GetRandomArticlesParams {
  n: number;
  category?: FeedCategory;
  lang?: FeedLang;
  feedId?: string;
}

export async function getRandomArticles(
  db: D1Database,
  params: GetRandomArticlesParams,
): Promise<Article[]> {
  const conds: string[] = [];
  const binds: D1BindParameter[] = [];

  if (params.category) {
    conds.push(`a.category = ?${binds.length + 1}`);
    binds.push(params.category);
  }
  if (params.lang) {
    conds.push(`a.lang = ?${binds.length + 1}`);
    binds.push(params.lang);
  }
  if (params.feedId) {
    conds.push(`a.feed_id = ?${binds.length + 1}`);
    binds.push(params.feedId);
  }

  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  const sql = `
    SELECT ${ARTICLES_SELECT_FIELDS}
    ${ARTICLES_FROM_JOIN}
    ${where}
    ORDER BY RANDOM()
    LIMIT ?${binds.length + 1}
  `;
  binds.push(params.n);

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<Article>();
  return result.results ?? [];
}

// ---------------------------------------------------------------------------
// getRelatedArticles
// ---------------------------------------------------------------------------

/**
 * guid に対する関連記事を返す。
 * 同 feed_id を優先し、不足分を同 category の記事で補う。
 * guid が存在しない場合は null を返す (呼び出し側で 404 ハンドル)。
 *
 * subrequest 削減のための CTE: target 取得後に同 feed / 同 category を
 * UNION ALL で 1 クエリにまとめ 3 subrequest → 2 subrequest に削減 (#398)。
 * same_feed CTE を参照して sameCategory 側で重複 guid を SQL で除外するため
 * アプリ層でのフィルタリングも不要。
 */
export async function getRelatedArticles(
  db: D1Database,
  guid: string,
  n: number,
): Promise<Article[] | null> {
  const target = await findArticleByGuid(db, guid);
  if (!target) return null;

  // CTE で「同 feed の最大 n 件」と「同 category かつ別 feed の最大 n 件」を
  // UNION ALL で 1 クエリにまとめる。source_priority で同 feed 優先を保証し、
  // 各グループ内は published_at DESC で整列する。
  // same_category 側も LIMIT ?3 で最大 n 件読むが、同 feed が少ないと余分に読む可能性がある。
  // 別 bind を増やすと statement キャッシュのヒット率が落ちるため n で固定し、
  // 外側 SELECT の LIMIT ?3 で最終的に n 件に絞る。
  const rows = await db
    .prepare(
      `WITH same_feed AS (
         SELECT ${ARTICLES_SELECT_FIELDS},
                0 AS source_priority
         ${ARTICLES_FROM_JOIN}
         WHERE a.feed_id = ?1 AND a.guid != ?2
         ORDER BY a.published_at DESC
         LIMIT ?3
       ),
       same_category AS (
         SELECT ${ARTICLES_SELECT_FIELDS},
                1 AS source_priority
         ${ARTICLES_FROM_JOIN}
         WHERE a.category = ?4 AND a.feed_id != ?1
           AND a.guid NOT IN (SELECT guid FROM same_feed)
           -- same_feed が空 (同 feed に他記事ゼロ) の場合に target 自身を弾くガード
           AND a.guid != ?2
         ORDER BY a.published_at DESC
         LIMIT ?3
       )
       SELECT ${ARTICLES_BARE_FIELDS}
       FROM (SELECT * FROM same_feed UNION ALL SELECT * FROM same_category)
       ORDER BY source_priority ASC, published_at DESC
       LIMIT ?3`,
    )
    .bind(target.feed_id, guid, n, target.category)
    .all<Article>();

  return rows.results ?? [];
}

// ---------------------------------------------------------------------------
// getNeighbors
// ---------------------------------------------------------------------------

export interface NeighborArticles {
  prev: Article | null;
  next: Article | null;
}

/**
 * guid の前後記事を同 feed_id 内で取得する。
 * tie-break は published_at が同一の場合 guid の辞書順で決定性を保証する。
 * guid が存在しない場合は null を返す (呼び出し側で 404 ハンドル)。
 *
 * subrequest 削減: prev / next の 2 クエリを db.batch で 1 subrequest に統合し
 * findArticleByGuid と合わせて計 3 → 2 subrequest に削減 (#445)。
 */
export async function getNeighbors(db: D1Database, guid: string): Promise<NeighborArticles | null> {
  const target = await findArticleByGuid(db, guid);
  if (!target) return null;

  const { feed_id, published_at } = target;

  // batch で prev / next を 1 subrequest にまとめる。
  // bind の placeholder はステートメントごとに独立しているため、両方 ?1/?2/?3 で記述できる。
  const [prevResult, nextResult] = await db.batch<Article>([
    db
      .prepare(
        `SELECT ${ARTICLES_SELECT_FIELDS}
         ${ARTICLES_FROM_JOIN}
         WHERE a.feed_id = ?1
           AND (a.published_at < ?2 OR (a.published_at = ?2 AND a.guid < ?3))
         ORDER BY a.published_at DESC, a.guid DESC
         LIMIT 1`,
      )
      .bind(feed_id, published_at, guid),
    db
      .prepare(
        `SELECT ${ARTICLES_SELECT_FIELDS}
         ${ARTICLES_FROM_JOIN}
         WHERE a.feed_id = ?1
           AND (a.published_at > ?2 OR (a.published_at = ?2 AND a.guid > ?3))
         ORDER BY a.published_at ASC, a.guid ASC
         LIMIT 1`,
      )
      .bind(feed_id, published_at, guid),
  ]);

  return {
    prev: prevResult.results[0] ?? null,
    next: nextResult.results[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// getArticlesByFeed / getArticlesByAuthor / getArticlesByCategory / getArticlesByDay
// ---------------------------------------------------------------------------

// 後方互換のために元の Result 型も export しておく (CursorPage のエイリアス)
export type GetArticlesByFeedResult = CursorPage;
export type GetArticlesByAuthorResult = CursorPage;
export type GetArticlesByCategoryResult = CursorPage;
export type GetArticlesByDayResult = CursorPage;

/** feed_id で記事を published_at DESC で取得。cursor は listArticles / getArticlesByAuthor と同形式 */
export async function getArticlesByFeed(
  db: D1Database,
  feedId: string,
  limit: number,
  cursor: Cursor | null,
): Promise<CursorPage> {
  const { sql, binds } = buildPaginatedQuery({
    baseConds: [`a.feed_id = ?1`],
    baseBinds: [feedId],
    limit,
    cursor,
  });

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<Article>();
  return extractWithCursor(result.results ?? [], limit);
}

/** 著者名で記事を published_at DESC で取得。cursor は listArticles と同形式 */
export async function getArticlesByAuthor(
  db: D1Database,
  author: string,
  limit: number,
  cursor: Cursor | null,
): Promise<CursorPage> {
  const { sql, binds } = buildPaginatedQuery({
    baseConds: [`a.author = ?1`],
    baseBinds: [author],
    limit,
    cursor,
  });

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<Article>();
  return extractWithCursor(result.results ?? [], limit);
}

/** category で記事を published_at DESC で取得。cursor は getArticlesByFeed / getArticlesByAuthor と同形式 */
export async function getArticlesByCategory(
  db: D1Database,
  category: FeedCategory,
  limit: number,
  cursor: Cursor | null,
): Promise<CursorPage> {
  const { sql, binds } = buildPaginatedQuery({
    baseConds: [`a.category = ?1`],
    baseBinds: [category],
    limit,
    cursor,
  });

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<Article>();
  return extractWithCursor(result.results ?? [], limit);
}

/** 指定日 (UTC 00:00:00 〜 翌日 00:00:00) の記事を published_at DESC で取得。cursor は既存と同形式 */
export async function getArticlesByDay(
  db: D1Database,
  startIso: string,
  endIso: string,
  limit: number,
  cursor: Cursor | null,
): Promise<CursorPage> {
  const { sql, binds } = buildPaginatedQuery({
    baseConds: [`a.published_at >= ?1`, `a.published_at < ?2`],
    baseBinds: [startIso, endIso],
    limit,
    cursor,
  });

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<Article>();
  return extractWithCursor(result.results ?? [], limit);
}
