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

/** 過去 30 日のカテゴリ別日次記事数を集計し、欠損日を 0 埋めして返す */
export async function getCategoryTrend30d(db: D1Database): Promise<CategoryTrendPoint[]> {
  const rows = await db
    .prepare(
      `SELECT date(published_at) AS date, category, COUNT(*) AS n
       FROM articles
       WHERE published_at >= date('now', '-30 days')
       GROUP BY date(published_at), category
       ORDER BY date(published_at) ASC`,
    )
    .all<{ date: string; category: string; n: number }>();

  // 過去 30 日分の date を生成 (今日含む)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const points: CategoryTrendPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    points.push({ date: dateStr, ai: 0, bigtech: 0, jp: 0, personal: 0 });
  }

  // クエリ結果をマップにして点に埋め込む
  const map = new Map<string, CategoryTrendPoint>();
  for (const p of points) map.set(p.date, p);

  for (const row of rows.results ?? []) {
    const point = map.get(row.date);
    if (!point) continue;
    const cat = row.category as keyof Omit<CategoryTrendPoint, "date">;
    if (cat in point) (point[cat] as number) += row.n;
  }

  return points;
}

/** 過去 30 日のフィード別記事数を集計して articles_30d 降順で返す */
export async function getFeedActivity30d(db: D1Database): Promise<FeedActivityRow[]> {
  const rows = await db
    .prepare(
      `SELECT a.feed_id,
              COALESCE(f.name, a.feed_id) AS feed_name,
              COUNT(*) AS articles_30d,
              MAX(a.published_at) AS last_published_at
       FROM articles a
       LEFT JOIN feeds f ON f.id = a.feed_id
       WHERE a.published_at >= date('now', '-30 days')
       GROUP BY a.feed_id
       ORDER BY articles_30d DESC`,
    )
    .all<FeedActivityRow>();

  return rows.results ?? [];
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

/**
 * 過去 30 日の author 別記事数 TOP 10 (null / 空文字除外)。
 * personal カテゴリ (個人ブログ) は企業 tech blog の人気著者ランキングからは除外する。
 */
export async function getTopAuthors30d(db: D1Database): Promise<TopAuthorRow[]> {
  const rows = await db
    .prepare(
      `SELECT author, COUNT(*) AS count
       FROM articles
       WHERE author IS NOT NULL
         AND author != ''
         AND category != 'personal'
         AND published_at >= datetime('now', '-30 days')
       GROUP BY author
       ORDER BY count DESC
       LIMIT 10`,
    )
    .all<TopAuthorRow>();

  return rows.results ?? [];
}

/** 過去 30 日の言語別記事数 (ja / en 両方を常に返す) */
export async function getByLang30d(db: D1Database): Promise<ByLang30d> {
  const rows = await db
    .prepare(
      `SELECT lang, COUNT(*) AS count
       FROM articles
       WHERE published_at >= datetime('now', '-30 days')
       GROUP BY lang`,
    )
    .all<{ lang: string; count: number }>();

  const result: ByLang30d = { ja: 0, en: 0 };
  for (const row of rows.results ?? []) {
    if (row.lang === "ja") result.ja = row.count;
    else if (row.lang === "en") result.en = row.count;
  }
  return result;
}
