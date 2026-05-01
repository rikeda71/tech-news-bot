import type { FeedCategory, FeedLang } from "../types";

// ---------------------------------------------------------------------------
// InsertableArticle 型
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// write 系
// ---------------------------------------------------------------------------

/**
 * 既存 guid を引いて Set で返す。
 * insertArticles の最初の SELECT を collector が直接呼べるように分離した。
 * collector は per-feed batch に INSERT 文をまとめるため、SELECT だけ事前に必要。
 */
export async function findExistingArticleGuids(
  db: D1Database,
  guids: string[],
): Promise<Set<string>> {
  if (guids.length === 0) return new Set();
  const placeholders = guids.map((_, i) => `?${i + 1}`).join(",");
  const existing = await db
    .prepare(`SELECT guid FROM articles WHERE guid IN (${placeholders})`)
    .bind(...guids)
    .all<{ guid: string }>();
  return new Set((existing.results ?? []).map((r) => r.guid));
}

/** INSERT OR IGNORE statement を組み立てる。collector の per-feed batch に渡す用。 */
export function buildInsertArticleStmts(
  db: D1Database,
  rows: InsertableArticle[],
): D1PreparedStatement[] {
  return rows.map((r) =>
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
}

export async function insertArticles(db: D1Database, rows: InsertableArticle[]): Promise<number> {
  if (rows.length === 0) return 0;

  // FTS トリガの changes() が混入するため、INSERT OR IGNORE の meta.changes は信頼できない。
  // 事前に existing guid を引いてフィルタする (cron 単一インスタンス前提)。
  const existingSet = await findExistingArticleGuids(
    db,
    rows.map((r) => r.guid),
  );
  const newRows = rows.filter((r) => !existingSet.has(r.guid));
  if (newRows.length === 0) return 0;

  const stmts = buildInsertArticleStmts(db, newRows);
  // D1 batch は 1 リクエスト 100 statements が上限
  const BATCH_SIZE = 50;
  for (let i = 0; i < stmts.length; i += BATCH_SIZE) {
    await db.batch(stmts.slice(i, i + BATCH_SIZE));
  }
  return newRows.length;
}
