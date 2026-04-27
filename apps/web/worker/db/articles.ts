import type { Article, FeedCategory, FeedLang } from "../types";

export interface InsertableArticle {
  guid: string;
  feed_id: string;
  title: string;
  url: string;
  summary: string | null;
  author: string | null;
  published_at: string;
  category: FeedCategory;
  lang: FeedLang;
}

export async function insertArticles(db: D1Database, rows: InsertableArticle[]): Promise<number> {
  if (rows.length === 0) return 0;

  // FTS トリガの changes() が混入するため、INSERT OR IGNORE の meta.changes は信頼できない。
  // 事前に existing guid を引いてフィルタする (cron 単一インスタンス前提)。
  const guids = rows.map((r) => r.guid);
  const placeholders = guids.map((_, i) => `?${i + 1}`).join(",");
  const existing = await db
    .prepare(`SELECT guid FROM articles WHERE guid IN (${placeholders})`)
    .bind(...guids)
    .all<{ guid: string }>();
  const existingSet = new Set((existing.results ?? []).map((r) => r.guid));
  const newRows = rows.filter((r) => !existingSet.has(r.guid));
  if (newRows.length === 0) return 0;

  const stmts = newRows.map((r) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO articles
           (guid, feed_id, title, url, summary, author, published_at, category, lang)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
      )
      .bind(
        r.guid,
        r.feed_id,
        r.title,
        r.url,
        r.summary,
        r.author,
        r.published_at,
        r.category,
        r.lang,
      ),
  );
  // D1 batch は 1 リクエスト 100 statements が上限
  const BATCH_SIZE = 50;
  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    await db.batch(stmts.slice(i, i + BATCH_SIZE));
  }
  return newRows.length;
}

export interface ListArticlesParams {
  category?: FeedCategory;
  lang?: FeedLang;
  feedId?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  limit: number;
  cursor?: { publishedAt: string; id: number } | null;
}

export interface ListArticlesResult {
  articles: Article[];
  nextCursor: { publishedAt: string; id: number } | null;
}

export async function listArticles(
  db: D1Database,
  params: ListArticlesParams,
): Promise<ListArticlesResult> {
  const limit = Math.min(Math.max(params.limit, 1), 100);
  const conds: string[] = [];
  const binds: unknown[] = [];

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
  if (params.cursor) {
    conds.push(
      `(a.published_at < ?${binds.length + 1} OR (a.published_at = ?${binds.length + 1} AND a.id < ?${binds.length + 2}))`,
    );
    binds.push(params.cursor.publishedAt, params.cursor.id);
  }

  let sql: string;
  if (params.q && params.q.trim()) {
    conds.push(
      `a.id IN (SELECT rowid FROM articles_fts WHERE articles_fts MATCH ?${binds.length + 1})`,
    );
    binds.push(escapeFtsQuery(params.q.trim()));
  }

  const where = conds.length > 0 ? `WHERE ${conds.join(" AND ")}` : "";
  sql = `
    SELECT a.id, a.guid, a.feed_id, f.name AS feed_name, a.title, a.url, a.summary,
           a.author, a.published_at, a.fetched_at, a.category, a.lang
    FROM articles a
    LEFT JOIN feeds f ON f.id = a.feed_id
    ${where}
    ORDER BY a.published_at DESC, a.id DESC
    LIMIT ?${binds.length + 1}
  `;
  binds.push(limit + 1);

  const result = await db
    .prepare(sql)
    .bind(...binds)
    .all<Article>();

  const rows = result.results ?? [];
  let nextCursor: { publishedAt: string; id: number } | null = null;
  let articles = rows;
  if (rows.length > limit) {
    articles = rows.slice(0, limit);
    const last = articles[articles.length - 1];
    nextCursor = { publishedAt: last.published_at, id: last.id };
  }
  return { articles, nextCursor };
}

export async function deleteOlderThan(db: D1Database, retentionDays: number): Promise<number> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return 0;
  // SQLite で安全のため整数化、少数日は切り捨て
  const days = Math.floor(retentionDays);
  const result = await db
    .prepare(`DELETE FROM articles WHERE published_at < datetime('now', ?1)`)
    .bind(`-${days} days`)
    .run();
  // FTS トリガで複数 changes が返るため、count(*) との差分は取らずに meta は参考値
  return result.meta?.changes ?? 0;
}

export interface CategoryTrendPoint {
  date: string;
  ai: number;
  bigtech: number;
  jp: number;
  zenn: number;
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
    points.push({ date: dateStr, ai: 0, bigtech: 0, jp: 0, zenn: 0 });
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

function escapeFtsQuery(input: string): string {
  // FTS5 で安全に扱うため、特殊記号を除去して各単語をフレーズ扱いにする
  const tokens = input
    .replace(/["()*:^]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    .map((t) => `"${t.replace(/"/g, "")}"`);
  return tokens.length > 0 ? tokens.join(" ") : '""';
}
