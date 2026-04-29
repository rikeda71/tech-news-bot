import { Hono } from "hono";
import type {
  CategoryTrendPoint,
  FeedActivityRow,
  TopAuthorRow,
  TopPublisherRow,
  ByLang30d,
} from "../db/articles";
import type { Env } from "../types";
import type { StatsResponse } from "./types";

const app = new Hono<{ Bindings: Env }>();

// 24 時間以上収集成功していない or 直近で error が記録されているフィードを stale と判定
const STALE_FEEDS_SQL = `
  SELECT id, name, last_status, last_fetched_at, last_error
  FROM feeds
  WHERE enabled = 1
    AND (
      last_status = 'error'
      OR last_fetched_at IS NULL
      OR last_fetched_at < datetime('now', '-1 day')
    )
  ORDER BY last_fetched_at IS NULL DESC, last_fetched_at ASC
`;

// no pagination needed (aggregate-only):
// total / by_category / by_lang は GROUP BY 1 クエリで完結し行数が増えない。
// stale_feeds はフィード数 (最大数百) に依存するが、全件表示が運用上必要なため除外しない。

app.get("/", async (c) => {
  const db = c.env.DB;

  // 10 クエリを 1 回の db.batch で発行してラウンドトリップを 1 本に削減する
  const [
    totalResult,
    byCategoryResult,
    byLangResult,
    recentResult,
    staleResult,
    categoryTrendRaw,
    feedActivityRaw,
    topAuthorsRaw,
    topPublishersRaw,
    byLang30dRaw,
  ] = await db.batch([
    db.prepare(
      "SELECT COUNT(*) AS n, MAX(published_at) AS last_published, MAX(fetched_at) AS last_fetched FROM articles",
    ),
    db.prepare(`SELECT category, COUNT(*) AS n FROM articles GROUP BY category`),
    db.prepare(`SELECT lang, COUNT(*) AS n FROM articles GROUP BY lang`),
    db.prepare(
      `SELECT COUNT(*) AS n FROM articles WHERE published_at >= datetime('now', '-1 day')`,
    ),
    db.prepare(STALE_FEEDS_SQL),
    db.prepare(
      `SELECT date(published_at) AS date, category, COUNT(*) AS n
       FROM articles
       WHERE published_at >= date('now', '-30 days')
       GROUP BY date(published_at), category
       ORDER BY date(published_at) ASC`,
    ),
    db.prepare(
      `SELECT a.feed_id,
              COALESCE(f.name, a.feed_id) AS feed_name,
              COUNT(*) AS articles_30d,
              MAX(a.published_at) AS last_published_at
       FROM articles a
       LEFT JOIN feeds f ON f.id = a.feed_id
       WHERE a.published_at >= date('now', '-30 days')
       GROUP BY a.feed_id
       ORDER BY articles_30d DESC`,
    ),
    db.prepare(
      `SELECT author, COUNT(*) AS count
       FROM articles
       WHERE author IS NOT NULL
         AND author != ''
         AND category != 'zenn'
         AND published_at >= datetime('now', '-30 days')
       GROUP BY author
       ORDER BY count DESC
       LIMIT 10`,
    ),
    db.prepare(
      `SELECT a.feed_id,
              COALESCE(f.name, a.feed_id) AS feed_name,
              COUNT(*) AS count
       FROM articles a
       LEFT JOIN feeds f ON f.id = a.feed_id
       WHERE a.published_at >= datetime('now', '-30 days')
       GROUP BY a.feed_id
       ORDER BY count DESC
       LIMIT 10`,
    ),
    db.prepare(
      `SELECT lang, COUNT(*) AS count
       FROM articles
       WHERE published_at >= datetime('now', '-30 days')
       GROUP BY lang`,
    ),
  ]);

  const totalRow = (totalResult.results?.[0] ?? null) as {
    n: number;
    last_published: string | null;
    last_fetched: string | null;
  } | null;
  const recentRow = (recentResult.results?.[0] ?? null) as { n: number } | null;

  // getCategoryTrend30d と同等の 0 埋め処理
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const points: CategoryTrendPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    points.push({ date: d.toISOString().slice(0, 10), ai: 0, bigtech: 0, jp: 0, zenn: 0 });
  }
  const trendMap = new Map<string, CategoryTrendPoint>();
  for (const p of points) trendMap.set(p.date, p);
  for (const row of (categoryTrendRaw.results ?? []) as {
    date: string;
    category: string;
    n: number;
  }[]) {
    const point = trendMap.get(row.date);
    if (!point) continue;
    const cat = row.category as keyof Omit<CategoryTrendPoint, "date">;
    if (cat in point) (point[cat] as number) += row.n;
  }

  // getByLang30d と同等の集計
  const byLang30d: ByLang30d = { ja: 0, en: 0 };
  for (const row of (byLang30dRaw.results ?? []) as { lang: string; count: number }[]) {
    if (row.lang === "ja") byLang30d.ja = row.count;
    else if (row.lang === "en") byLang30d.en = row.count;
  }

  return c.json<StatsResponse>({
    total: totalRow?.n ?? 0,
    last_published_at: totalRow?.last_published ?? null,
    last_fetched_at: totalRow?.last_fetched ?? null,
    last24h: recentRow?.n ?? 0,
    by_category: Object.fromEntries(
      ((byCategoryResult.results ?? []) as { category: string; n: number }[]).map((r) => [
        r.category,
        r.n,
      ]),
    ),
    by_lang: Object.fromEntries(
      ((byLangResult.results ?? []) as { lang: string; n: number }[]).map((r) => [r.lang, r.n]),
    ),
    stale_feeds: (staleResult.results ?? []) as StatsResponse["stale_feeds"],
    category_trend_30d: points,
    feed_activity: (feedActivityRaw.results ?? []) as FeedActivityRow[],
    top_authors_30d: (topAuthorsRaw.results ?? []) as TopAuthorRow[],
    top_publishers_30d: (topPublishersRaw.results ?? []) as TopPublisherRow[],
    by_lang_30d: byLang30d,
  });
});

export default app;
