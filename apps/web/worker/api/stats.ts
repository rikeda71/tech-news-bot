import { Hono } from "hono";
import { getCategoryTrend30d, getFeedActivity30d } from "../db/articles";
import type { Env } from "../types";

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
  const totalRow = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n, MAX(published_at) AS last_published, MAX(fetched_at) AS last_fetched FROM articles",
  ).first<{ n: number; last_published: string | null; last_fetched: string | null }>();

  const byCategory = await c.env.DB.prepare(
    `SELECT category, COUNT(*) AS n FROM articles GROUP BY category`,
  ).all<{ category: string; n: number }>();

  const byLang = await c.env.DB.prepare(
    `SELECT lang, COUNT(*) AS n FROM articles GROUP BY lang`,
  ).all<{ lang: string; n: number }>();

  const recent = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n FROM articles WHERE published_at >= datetime('now', '-1 day')`,
  ).first<{ n: number }>();

  const staleRows = await c.env.DB.prepare(STALE_FEEDS_SQL).all<{
    id: string;
    name: string;
    last_status: string | null;
    last_fetched_at: string | null;
    last_error: string | null;
  }>();

  const [categoryTrend30d, feedActivity] = await Promise.all([
    getCategoryTrend30d(c.env.DB),
    getFeedActivity30d(c.env.DB),
  ]);

  return c.json({
    total: totalRow?.n ?? 0,
    last_published_at: totalRow?.last_published ?? null,
    last_fetched_at: totalRow?.last_fetched ?? null,
    last24h: recent?.n ?? 0,
    by_category: Object.fromEntries((byCategory.results ?? []).map((r) => [r.category, r.n])),
    by_lang: Object.fromEntries((byLang.results ?? []).map((r) => [r.lang, r.n])),
    stale_feeds: staleRows.results ?? [],
    category_trend_30d: categoryTrend30d,
    feed_activity: feedActivity,
  });
});

export default app;
