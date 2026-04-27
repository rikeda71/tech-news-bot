export interface HealthSummary {
  articles_total: number;
  feeds_total: number;
  feeds_enabled: number;
  latest_published_at: string | null;
  latest_fetched_at: string | null;
}

/** D1 batch で 1 round trip に集約して health 統計を返す。 */
export async function getHealthSummary(db: D1Database): Promise<HealthSummary> {
  const [articleStats, feedStats] = await db.batch([
    db.prepare(
      `SELECT COUNT(*) AS articles_total,
              MAX(published_at) AS latest_published_at,
              MAX(fetched_at) AS latest_fetched_at
       FROM articles`,
    ),
    db.prepare(
      `SELECT COUNT(*) AS feeds_total,
              SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS feeds_enabled
       FROM feeds`,
    ),
  ]);

  const aRow = (articleStats.results[0] ?? {}) as {
    articles_total: number;
    latest_published_at: string | null;
    latest_fetched_at: string | null;
  };
  const fRow = (feedStats.results[0] ?? {}) as {
    feeds_total: number;
    feeds_enabled: number | null;
  };

  return {
    articles_total: aRow.articles_total ?? 0,
    feeds_total: fRow.feeds_total ?? 0,
    feeds_enabled: fRow.feeds_enabled ?? 0,
    latest_published_at: aRow.latest_published_at ?? null,
    latest_fetched_at: aRow.latest_fetched_at ?? null,
  };
}
