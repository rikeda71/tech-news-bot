import type { Article } from "../types";

// ---------------------------------------------------------------------------
// 共通定数 (articles-query.ts と共有)
// ---------------------------------------------------------------------------

/** cursor ページネーションで使う SELECT カラム一覧 */
export const ARTICLES_SELECT_FIELDS = `a.id, a.guid, a.feed_id, f.name AS feed_name, a.title, a.url, a.summary,
           a.author, a.published_at, a.fetched_at, a.category, a.lang`;

/** articles + feeds の FROM / JOIN 句 */
export const ARTICLES_FROM_JOIN = "FROM articles a LEFT JOIN feeds f ON f.id = a.feed_id";

// ---------------------------------------------------------------------------
// Cursor 型
// ---------------------------------------------------------------------------

export type Cursor = { publishedAt: string; id: number };

// ---------------------------------------------------------------------------
// CursorPage 型 — GetArticlesBy* の共通戻り値型
// ---------------------------------------------------------------------------

export interface CursorPage {
  articles: Article[];
  nextCursor: Cursor | null;
}

// ---------------------------------------------------------------------------
// cursor 条件ヘルパー
// ---------------------------------------------------------------------------

/**
 * cursor 条件を conds / binds に追記する。
 * cursor がない場合は何もしない。
 */
export function appendCursorCondition(
  conds: string[],
  binds: unknown[],
  cursor: Cursor | null | undefined,
): void {
  if (!cursor) return;
  conds.push(
    `(a.published_at < ?${binds.length + 1} OR (a.published_at = ?${binds.length + 1} AND a.id < ?${binds.length + 2}))`,
  );
  binds.push(cursor.publishedAt, cursor.id);
}

/**
 * DB から取得した rows を limit と比較して { articles, nextCursor } に変換する。
 * DB には limit+1 件をリクエストしており、超えていればカーソルを生成して slice する。
 */
export function extractWithCursor(rows: Article[], limit: number): CursorPage {
  if (rows.length <= limit) {
    return { articles: rows, nextCursor: null };
  }
  const articles = rows.slice(0, limit);
  const last = articles[articles.length - 1];
  return { articles, nextCursor: { publishedAt: last.published_at, id: last.id } };
}

// ---------------------------------------------------------------------------
// buildPaginatedQuery — 5 つの paginated read 関数で共有する SQL 組み立てヘルパー
// ---------------------------------------------------------------------------

export type BuildPaginatedQueryInput = {
  baseConds: string[];
  baseBinds: unknown[];
  limit: number;
  cursor: Cursor | null | undefined;
};

export type BuildPaginatedQueryOutput = {
  sql: string;
  binds: unknown[];
};

/**
 * cursor pagination 共通の SELECT SQL と binds を組み立てる。
 * baseConds / baseBinds はすでに positional placeholder (?1, ?2, ...) で構築されている前提。
 * cursor 条件を末尾に追記し、LIMIT ?N を付与する。
 */
export function buildPaginatedQuery(input: BuildPaginatedQueryInput): BuildPaginatedQueryOutput {
  const conds = [...input.baseConds];
  const binds = [...input.baseBinds];

  appendCursorCondition(conds, binds, input.cursor);

  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  const sql = `
    SELECT ${ARTICLES_SELECT_FIELDS}
    ${ARTICLES_FROM_JOIN}
    ${where}
    ORDER BY a.published_at DESC, a.id DESC
    LIMIT ?${binds.length + 1}
  `;
  binds.push(input.limit + 1);

  return { sql, binds };
}
