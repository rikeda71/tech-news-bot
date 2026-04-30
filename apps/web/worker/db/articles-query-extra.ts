import type { Article, FeedCategory, FeedLang } from "../types";
import {
  ARTICLES_FROM_JOIN,
  ARTICLES_SELECT_FIELDS,
  type Cursor,
  appendCursorCondition,
  extractWithCursor,
} from "./articles-cursor";

// ---------------------------------------------------------------------------
// 月次系
// ---------------------------------------------------------------------------

export interface GetArticlesByMonthParams {
  category?: FeedCategory;
  lang?: FeedLang;
  limit?: number;
}

export async function getArticlesByMonth(
  db: D1Database,
  year: number,
  month: number,
  opts?: GetArticlesByMonthParams,
): Promise<Article[]> {
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 1)).toISOString();
  const limit = Math.min(Math.max(opts?.limit ?? 200, 1), 500);

  const conds: string[] = [`a.published_at >= ?1`, `a.published_at < ?2`];
  const binds: unknown[] = [start, end];

  if (opts?.category) {
    conds.push(`a.category = ?${binds.length + 1}`);
    binds.push(opts.category);
  }
  if (opts?.lang) {
    conds.push(`a.lang = ?${binds.length + 1}`);
    binds.push(opts.lang);
  }

  const where = `WHERE ${conds.join(" AND ")}`;
  const sql = `
    SELECT ${ARTICLES_SELECT_FIELDS}
    ${ARTICLES_FROM_JOIN}
    ${where}
    ORDER BY a.published_at DESC, a.id DESC
    LIMIT ?${binds.length + 1}
  `;
  binds.push(limit);

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<Article>();
  return result.results ?? [];
}

export interface CountArticlesByMonthParams {
  category?: FeedCategory;
  lang?: FeedLang;
}

export async function countArticlesByMonth(
  db: D1Database,
  year: number,
  month: number,
  opts?: CountArticlesByMonthParams,
): Promise<number> {
  const start = new Date(Date.UTC(year, month - 1, 1)).toISOString();
  const end = new Date(Date.UTC(year, month, 1)).toISOString();

  const conds: string[] = [`published_at >= ?1`, `published_at < ?2`];
  const binds: unknown[] = [start, end];

  if (opts?.category) {
    conds.push(`category = ?${binds.length + 1}`);
    binds.push(opts.category);
  }
  if (opts?.lang) {
    conds.push(`lang = ?${binds.length + 1}`);
    binds.push(opts.lang);
  }

  const where = `WHERE ${conds.join(" AND ")}`;
  const sql = `SELECT COUNT(*) AS c FROM articles ${where}`;

  const row = await db
    .prepare(sql)
    .bind(...binds)
    .first<{ c: number }>();

  return row?.c ?? 0;
}

// ---------------------------------------------------------------------------
// calendar
// ---------------------------------------------------------------------------

export interface CalendarItem {
  date: string;
  count: number;
}

/** 指定日数分の日別記事数を返す。0 件の日は含まない */
export async function getArticlesCalendar(
  db: D1Database,
  days: number,
  lang?: FeedLang | null,
  category?: FeedCategory | null,
): Promise<CalendarItem[]> {
  const conds: string[] = [`published_at >= datetime('now', ?1)`];
  const binds: unknown[] = [`-${days} days`];

  if (lang) {
    conds.push(`lang = ?${binds.length + 1}`);
    binds.push(lang);
  }
  if (category) {
    conds.push(`category = ?${binds.length + 1}`);
    binds.push(category);
  }

  const where = `WHERE ${conds.join(" AND ")}`;
  const sql = `
    SELECT strftime('%Y-%m-%d', published_at) AS date, COUNT(*) AS count
    FROM articles
    ${where}
    GROUP BY strftime('%Y-%m-%d', published_at)
    ORDER BY date ASC
  `;

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<CalendarItem>();

  return result.results ?? [];
}

// ---------------------------------------------------------------------------
// searchArticles
// ---------------------------------------------------------------------------

export interface SearchArticlesResult {
  articles: Article[];
  nextCursor: Cursor | null;
}

/**
 * FTS5 (trigram tokenizer) を使った全文検索。
 * LIKE fallback は削除済み。FTS5 が機能している前提で単一クエリで完結する。
 * D1 subrequest: before = 1 (LIKE) → after = 1 (FTS5 subquery 込み) で同数だが、
 * LIKE は token 数分の AND 連鎖だったため実行コストを削減。
 *
 * q が空文字の場合は全件検索相当になるため、呼び出し元で事前に弾くこと。
 */
export async function searchArticles(
  db: D1Database,
  q: string,
  limit: number,
  cursor: Cursor | null,
): Promise<SearchArticlesResult> {
  const conds: string[] = [];
  const binds: unknown[] = [];

  // FTS5 MATCH 条件: rowid (= articles.id) で articles テーブルと JOIN する
  conds.push(
    `a.id IN (SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?${binds.length + 1})`,
  );
  binds.push(escapeFtsQuery(q));

  appendCursorCondition(conds, binds, cursor);

  const where = `WHERE ${conds.join(" AND ")}`;
  const sql = `
    SELECT ${ARTICLES_SELECT_FIELDS}
    ${ARTICLES_FROM_JOIN}
    ${where}
    ORDER BY a.published_at DESC, a.id DESC
    LIMIT ?${binds.length + 1}
  `;
  binds.push(limit + 1);

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<Article>();
  return extractWithCursor(result.results ?? [], limit);
}

/**
 * FTS5 MATCH クエリの特殊文字をエスケープして安全なフレーズクエリに変換する。
 * 入力をスペース区切りトークンに分割し、各トークンをダブルクォートで括る。
 * FTS5 特殊文字 ( " ( ) * : ^ ) は除去してから括る。
 * 空クエリになった場合は '""' を返す (ヒット 0 件)。
 */
function escapeFtsQuery(input: string): string {
  const tokens = input
    .replace(/["()*:^]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((t) => `"${t.replace(/"/g, "")}"`);
  return tokens.length > 0 ? tokens.join(" ") : '""';
}

// ---------------------------------------------------------------------------
// countArticlesByDay
// ---------------------------------------------------------------------------

/** 指定日 (UTC) の総記事数を返す */
export async function countArticlesByDay(
  db: D1Database,
  startIso: string,
  endIso: string,
): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS c FROM articles WHERE published_at >= ?1 AND published_at < ?2`)
    .bind(startIso, endIso)
    .first<{ c: number }>();
  return row?.c ?? 0;
}
