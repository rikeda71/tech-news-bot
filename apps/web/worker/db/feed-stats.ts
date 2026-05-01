import type {
  Article,
  FeedCategory,
  FeedConfig,
  FeedDiagnostic,
  FeedHealth,
  FeedLang,
} from "../types";
import type { CategorySummaryDbRow, FeedDiagnosticDbRow, FeedHealthFeedsDbRow } from "./types";
import { daysAgoIso } from "./_helpers";

export interface CategorySummary {
  id: FeedCategory;
  label: string;
  feeds_count: number;
  articles_30d: number;
  last_published_at: string | null;
}

const ALL_CATEGORIES: FeedCategory[] = ["bigtech", "ai", "jp", "personal"];

// client 側の CategorySummary.label に対応するマッピング
const CATEGORY_LABELS: Record<FeedCategory, string> = {
  bigtech: "ビッグテック",
  ai: "AI",
  jp: "日本企業",
  personal: "個人ブログ",
};

/**
 * カテゴリ別のサマリを 1 クエリで取得する。
 * feeds テーブルに articles を LEFT JOIN して GROUP BY category。
 * D1 の結果に含まれないカテゴリ (フィード 0 件) は TS 側で 0 埋めして必ず 4 件返す。
 * client 側の CategorySummary 型に合わせて id / label を返す。
 */
export async function getCategoriesSummary(db: D1Database): Promise<CategorySummary[]> {
  const threshold = daysAgoIso(30);

  const rows = await db
    .prepare(
      `SELECT f.category,
              COUNT(DISTINCT f.id) AS feeds_count,
              COUNT(CASE WHEN a.published_at >= ?1 THEN 1 END) AS articles_30d,
              MAX(a.published_at) AS last_published_at
       FROM feeds f
       LEFT JOIN articles a ON a.feed_id = f.id
       GROUP BY f.category`,
    )
    .bind(threshold)
    .all<CategorySummaryDbRow>();

  const dbMap = new Map(
    (rows.results ?? []).map((r) => {
      const id = r.category as CategorySummary["id"];
      return [
        id,
        {
          id,
          label: CATEGORY_LABELS[id],
          feeds_count: r.feeds_count,
          articles_30d: r.articles_30d,
          last_published_at: r.last_published_at,
        },
      ];
    }),
  );

  // DB に存在しないカテゴリも 0 埋めして全 4 カテゴリを返す
  return ALL_CATEGORIES.map(
    (cat) =>
      dbMap.get(cat) ?? {
        id: cat,
        label: CATEGORY_LABELS[cat],
        feeds_count: 0,
        articles_30d: 0,
        last_published_at: null,
      },
  );
}

/**
 * 全フィードの運用診断情報を 1 クエリで返す。
 * feeds テーブルの全カラム + articles の累積件数・30d 件数・最終公開日時を JOIN する。
 * enabled の有無に関わらず全フィードを返す (運用ダッシュボード用)。
 */
export async function getFeedsDiagnostics(db: D1Database): Promise<FeedDiagnostic[]> {
  const threshold = daysAgoIso(30);

  const rows = await db
    .prepare(
      `SELECT f.id,
              f.name,
              f.url,
              f.category,
              f.lang,
              f.enabled,
              f.last_fetched_at,
              f.last_status,
              f.last_error,
              f.last_etag,
              f.last_modified,
              f.consecutive_failures AS fetch_error_count,
              COUNT(a.id) AS articles_total,
              COUNT(CASE WHEN a.published_at >= ?1 THEN 1 END) AS articles_30d,
              MAX(a.published_at) AS last_published_at
       FROM feeds f
       LEFT JOIN articles a ON a.feed_id = f.id
       GROUP BY f.id, f.name, f.url, f.category, f.lang, f.enabled,
                f.last_fetched_at, f.last_status, f.last_error,
                f.last_etag, f.last_modified, f.consecutive_failures
       ORDER BY f.id ASC`,
    )
    .bind(threshold)
    .all<FeedDiagnosticDbRow>();

  return (rows.results ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    url: r.url,
    category: r.category as FeedCategory,
    lang: r.lang as FeedLang,
    enabled: r.enabled === 1,
    last_fetched_at: r.last_fetched_at,
    last_status: r.last_status,
    last_error: r.last_error,
    last_etag: r.last_etag,
    last_modified: r.last_modified,
    fetch_error_count: r.fetch_error_count,
    articles_total: r.articles_total,
    articles_30d: r.articles_30d,
    last_published_at: r.last_published_at,
  }));
}

/**
 * 指定フィードの最近の記事を published_at 降順で返す。
 * db/articles.ts への変更を避けるため feeds.ts 内に定義。
 */
export async function getRecentArticlesByFeed(
  db: D1Database,
  feedId: string,
  limit: number,
): Promise<Article[]> {
  const rows = await db
    .prepare(
      `SELECT a.id, a.guid, a.feed_id, f.name AS feed_name, a.title, a.url, a.summary,
              a.author, a.published_at, a.fetched_at, a.category, a.lang
       FROM articles a
       LEFT JOIN feeds f ON f.id = a.feed_id
       WHERE a.feed_id = ?1
       ORDER BY a.published_at DESC
       LIMIT ?2`,
    )
    .bind(feedId, limit)
    .all<Article>();

  return rows.results ?? [];
}

/**
 * feeds テーブルと articles テーブルを JOIN して /api/feeds/health 用の集計を返す。
 * 1 クエリで完結させ D1 の 50ms CPU 制約に収める。
 */
export async function getFeedHealth(db: D1Database, feeds: FeedConfig[]): Promise<FeedHealth[]> {
  if (feeds.length === 0) return [];

  const rows = await db
    .prepare(
      `SELECT f.id,
              f.last_success_at,
              f.last_failure_at,
              f.consecutive_failures,
              COUNT(a.id) AS articles_last_7d
       FROM feeds f
       LEFT JOIN articles a
         ON a.feed_id = f.id
        AND a.published_at >= datetime('now', '-7 days')
       GROUP BY f.id`,
    )
    .all<FeedHealthFeedsDbRow>();

  const dbMap = new Map(rows.results.map((r) => [r.id, r]));

  return feeds.map((f) => {
    const row = dbMap.get(f.id);
    return {
      feed_id: f.id,
      feed_name: f.name,
      enabled: f.enabled,
      last_success_at: row?.last_success_at ?? null,
      last_failure_at: row?.last_failure_at ?? null,
      consecutive_failures: row?.consecutive_failures ?? 0,
      articles_last_7d: row?.articles_last_7d ?? 0,
    };
  });
}
