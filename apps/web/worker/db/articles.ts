/**
 * articles.ts — 薄い re-export ファイル
 *
 * 既存の import (`worker/api/*`, `worker/collector/*`, テストコード) を壊さないために
 * このファイルはエントリポイントとして維持し、実装は以下に分割している:
 *   - articles-cursor.ts       … cursor pagination 共通ヘルパー / 型
 *   - articles-query.ts        … コア read 系 (list / related / neighbors / feed / author / category / day)
 *   - articles-query-extra.ts  … 月次 / calendar / searchArticles
 *   - articles-stats.ts        … count / トレンド / stats 系クエリ
 *   - articles-write.ts        … write 系 (insert / upsert)
 */
export type {
  Cursor,
  CursorPage,
  BuildPaginatedQueryInput,
  BuildPaginatedQueryOutput,
} from "./articles-cursor";
export {
  ARTICLES_SELECT_FIELDS,
  ARTICLES_FROM_JOIN,
  appendCursorCondition,
  extractWithCursor,
  buildPaginatedQuery,
} from "./articles-cursor";

export type {
  ListArticlesParams,
  ListArticlesResult,
  GetRandomArticlesParams,
  NeighborArticles,
  GetArticlesByFeedResult,
  GetArticlesByAuthorResult,
  GetArticlesByCategoryResult,
  GetArticlesByDayResult,
} from "./articles-query";
export {
  getArticleById,
  findArticleByGuid,
  listArticles,
  getRandomArticles,
  getRelatedArticles,
  getNeighbors,
  getArticlesByFeed,
  getArticlesByAuthor,
  getArticlesByCategory,
  getArticlesByDay,
} from "./articles-query";

export type {
  GetArticlesByMonthParams,
  CountArticlesByMonthParams,
  CalendarItem,
  SearchArticlesResult,
} from "./articles-query-extra";
export {
  getArticlesByMonth,
  countArticlesByMonth,
  getArticlesCalendar,
  searchArticles,
  countArticlesByDay,
} from "./articles-query-extra";

export type {
  CategoryTrendPoint,
  FeedActivityRow,
  TopAuthorRow,
  TopPublisherRow,
  ByLang30d,
} from "./articles-stats";
export {
  countAllArticles,
  countArticlesSince,
  getCategoryTrend30d,
  getFeedActivity30d,
  getTopAuthors30d,
  getByLang30d,
} from "./articles-stats";

export type { InsertableArticle } from "./articles-write";
export {
  findExistingArticleGuids,
  buildInsertArticleStmts,
  insertArticles,
} from "./articles-write";
