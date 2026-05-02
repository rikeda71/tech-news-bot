import { Hono } from "hono";
import type {
  CategoryTrendPoint,
  FeedActivityRow,
  TopAuthorRow,
  TopPublisherRow,
  ByLang30d,
} from "../db/articles";
import { rowsAs } from "../db/_helpers";
import { isCategory } from "../db/_guards";
import type { Env } from "../types";
import type { StatsResponse } from "./types";

// 全期間集計を 1 クエリにまとめることで articles テーブルのフルスキャンを 4→1 回に削減する
const SUMMARY_SQL = `
  SELECT
    COUNT(*) AS total,
    MAX(published_at) AS last_published,
    MAX(fetched_at)   AS last_fetched,
    SUM(CASE WHEN published_at >= datetime('now','-1 day') THEN 1 ELSE 0 END) AS last24h,
    SUM(CASE WHEN category='bigtech'  THEN 1 ELSE 0 END) AS cat_bigtech,
    SUM(CASE WHEN category='ai'       THEN 1 ELSE 0 END) AS cat_ai,
    SUM(CASE WHEN category='jp'       THEN 1 ELSE 0 END) AS cat_jp,
    SUM(CASE WHEN category='personal' THEN 1 ELSE 0 END) AS cat_personal,
    SUM(CASE WHEN lang='ja' THEN 1 ELSE 0 END) AS lang_ja,
    SUM(CASE WHEN lang='en' THEN 1 ELSE 0 END) AS lang_en
  FROM articles
`;

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

  // 集計データなので 1 分キャッシュを許容する (stale-while-revalidate でエッジキャッシュ効率を上げる)
  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

  try {
    // 6 クエリを 1 回の db.batch で発行してラウンドトリップを 1 本に削減する
    // (SUMMARY_SQL で全期間集計 4→1、feedActivity から top_publishers を派生させて 2→1)
    const [
      summaryResult,
      staleResult,
      categoryTrendRaw,
      feedActivityRaw,
      topAuthorsRaw,
      byLang30dRaw,
    ] = await db.batch([
      db.prepare(SUMMARY_SQL),
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
           AND category != 'personal'
           AND published_at >= datetime('now', '-30 days')
         GROUP BY author
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

    type SummaryRow = {
      total: number;
      last_published: string | null;
      last_fetched: string | null;
      last24h: number;
      cat_bigtech: number;
      cat_ai: number;
      cat_jp: number;
      cat_personal: number;
      lang_ja: number;
      lang_en: number;
    };
    const summaryRow = rowsAs<SummaryRow>(summaryResult)[0] ?? null;

    // getCategoryTrend30d と同等の 0 埋め処理
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const points: CategoryTrendPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setUTCDate(today.getUTCDate() - i);
      points.push({ date: d.toISOString().slice(0, 10), ai: 0, bigtech: 0, jp: 0, personal: 0 });
    }
    const trendMap = new Map<string, CategoryTrendPoint>();
    for (const p of points) trendMap.set(p.date, p);
    for (const row of rowsAs<{ date: string; category: string; n: number }>(categoryTrendRaw)) {
      const point = trendMap.get(row.date);
      if (!point) continue;
      if (isCategory(row.category)) {
        point[row.category] += row.n;
      }
    }

    // getByLang30d と同等の集計
    const byLang30d: ByLang30d = { ja: 0, en: 0 };
    for (const row of rowsAs<{ lang: string; count: number }>(byLang30dRaw)) {
      if (row.lang === "ja") byLang30d.ja = row.count;
      else if (row.lang === "en") byLang30d.en = row.count;
    }
    const feedActivity = rowsAs<FeedActivityRow>(feedActivityRaw);
    // feedActivity は articles_30d DESC 済みなので先頭 10 件が top_publishers と等価
    const topPublishers: TopPublisherRow[] = feedActivity.slice(0, 10).map((r) => ({
      feed_id: r.feed_id,
      feed_name: r.feed_name,
      count: r.articles_30d,
    }));

    return c.json<StatsResponse>({
      total: summaryRow?.total ?? 0,
      last_published_at: summaryRow?.last_published ?? null,
      last_fetched_at: summaryRow?.last_fetched ?? null,
      last24h: summaryRow?.last24h ?? 0,
      by_category: {
        bigtech: summaryRow?.cat_bigtech ?? 0,
        ai: summaryRow?.cat_ai ?? 0,
        jp: summaryRow?.cat_jp ?? 0,
        personal: summaryRow?.cat_personal ?? 0,
      },
      by_lang: {
        ja: summaryRow?.lang_ja ?? 0,
        en: summaryRow?.lang_en ?? 0,
      },
      stale_feeds: rowsAs<StatsResponse["stale_feeds"][number]>(staleResult),
      category_trend_30d: points,
      feed_activity: feedActivity,
      top_authors_30d: rowsAs<TopAuthorRow>(topAuthorsRaw),
      top_publishers_30d: topPublishers,
      by_lang_30d: byLang30d,
    });
  } catch (err) {
    // D1 エラーの詳細 (SQL/テーブル名等) をクライアントに漏らさない
    console.error("[stats] D1 batch failed:", err instanceof Error ? err.message : String(err));
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

export default app;
