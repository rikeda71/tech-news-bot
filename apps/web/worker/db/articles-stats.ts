// ---------------------------------------------------------------------------
// count / トレンド / stats 系クエリ
// ---------------------------------------------------------------------------

export async function countAllArticles(db: D1Database): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS c FROM articles`).first<{ c: number }>();
  return row?.c ?? 0;
}

export async function countArticlesSince(db: D1Database, isoDate: string): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS c FROM articles WHERE published_at >= ?1`)
    .bind(isoDate)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

export interface ArticleHealthStats {
  total: number;
  since: number;
}

/**
 * articles テーブルの total 件数と指定日時以降の件数を 1 クエリで取得する。
 * health endpoint で 2 本の個別クエリを 1 ラウンドトリップに削減するために使う。
 */
export async function getHealthArticleStats(
  db: D1Database,
  isoDate: string,
): Promise<ArticleHealthStats> {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN published_at >= ?1 THEN 1 ELSE 0 END) AS since
       FROM articles`,
    )
    .bind(isoDate)
    .first<{ total: number; since: number | null }>();
  return { total: row?.total ?? 0, since: row?.since ?? 0 };
}

export interface CategoryTrendPoint {
  date: string;
  ai: number;
  bigtech: number;
  jp: number;
  personal: number;
}

export interface FeedActivityRow {
  feed_id: string;
  feed_name: string;
  articles_30d: number;
  last_published_at: string | null;
}

export interface TopAuthorRow {
  author: string;
  count: number;
}

export interface TopPublisherRow {
  feed_id: string;
  feed_name: string;
  count: number;
}

export interface ByLang30d {
  ja: number;
  en: number;
}
