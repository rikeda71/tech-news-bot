import { Hono } from "hono";
import { countFeeds } from "../db/feeds";
import { getFeedHealth } from "../db/feed-stats";
import { countAllArticles, countArticlesSince } from "../db/articles";
import { getLatestCompletedRun } from "../db/runs";
import { loadAllFeeds } from "../feed-config";
import type { Env, FeedHealth } from "../types";
import type { HealthFeedsResponse, HealthResponse } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [feedsTotal, feedsEnabled, articlesTotal, articles24h, latestRun] = await Promise.all([
      countFeeds(c.env.DB),
      countFeeds(c.env.DB, { enabled: true }),
      countAllArticles(c.env.DB),
      countArticlesSince(c.env.DB, since24h),
      getLatestCompletedRun(c.env.DB),
    ]);

    const body: HealthResponse = {
      ok: true,
      version: "0.1",
      now: new Date().toISOString(),
      feeds: {
        total: feedsTotal,
        enabled: feedsEnabled,
      },
      articles: {
        total: articlesTotal,
        last_24h: articles24h,
      },
      last_cron_run: latestRun
        ? {
            id: latestRun.id,
            started_at: latestRun.started_at,
            // getLatestCompletedRun は completed_at IS NOT NULL 保証
            completed_at: latestRun.completed_at as string,
            feeds_total: latestRun.feeds_total ?? 0,
            feeds_ok: latestRun.feeds_ok ?? 0,
            feeds_failed: latestRun.feeds_failed ?? 0,
            articles_inserted: latestRun.articles_inserted ?? 0,
          }
        : null,
    };

    c.header("Cache-Control", "no-cache");
    return c.json<HealthResponse>(body);
  } catch (err) {
    // D1 エラーの詳細 (SQL/テーブル名等) をクライアントに漏らさない
    console.error("[health] D1 query failed:", err instanceof Error ? err.message : String(err));
    return c.json({ ok: false, error: "Internal Server Error" }, 500);
  }
});

// feeds.yaml の全フィードに対してヘルス情報 (最終成功/失敗時刻・連続失敗数・直近7日記事数) を返す。
app.get("/feeds", async (c) => {
  try {
    const configFeeds = loadAllFeeds();
    const health: FeedHealth[] = await getFeedHealth(c.env.DB, configFeeds);
    c.header("Cache-Control", "public, max-age=60");
    return c.json<HealthFeedsResponse>(health);
  } catch (err) {
    // D1 エラーの詳細 (SQL/テーブル名等) をクライアントに漏らさない
    console.error(
      "[health/feeds] D1 query failed:",
      err instanceof Error ? err.message : String(err),
    );
    return c.json({ status: "degraded", error: "Internal Server Error" }, 500);
  }
});

export default app;
