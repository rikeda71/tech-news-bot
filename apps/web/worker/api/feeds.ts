import { Hono } from "hono";
import { loadAllFeeds } from "../feed-config";
import type { Env, FeedCategory, FeedLang } from "../types";
import { findFeedWithStats, listFeedsWithStats } from "../db/feeds";
import { getRecentArticlesByFeed } from "../db/feed-stats";
import { getFeedHealth } from "../db/runs";
import { isCategory, isLang } from "./_guards";
import type { FeedsListResponse, FeedDetailResponse, FeedRunHealthResponse } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  const { req } = c;
  const categoryRaw = req.query("category");
  const langRaw = req.query("lang");
  const enabledRaw = req.query("enabled");

  // 不正なクエリパラメータは 400 を返す
  if (categoryRaw !== undefined && !isCategory(categoryRaw)) {
    return c.json({ error: `invalid category: ${categoryRaw}` }, 400);
  }
  if (langRaw !== undefined && !isLang(langRaw)) {
    return c.json({ error: `invalid lang: ${langRaw}` }, 400);
  }
  if (enabledRaw !== undefined && enabledRaw !== "true" && enabledRaw !== "false") {
    return c.json({ error: `invalid enabled: ${enabledRaw}` }, 400);
  }

  const opts: { category?: FeedCategory; lang?: FeedLang; enabled?: boolean } = {};
  if (isCategory(categoryRaw)) opts.category = categoryRaw;
  if (isLang(langRaw)) opts.lang = langRaw;
  if (enabledRaw !== undefined) opts.enabled = enabledRaw === "true";

  const feeds = await listFeedsWithStats(c.env.DB, opts);
  return c.json<FeedsListResponse>({ feeds }, 200, {
    "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
  });
});

const RECENT_DEFAULT = 10;
const RECENT_MAX = 50;

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const recentRaw = c.req.query("recent");

  // recent バリデーション
  let recent = RECENT_DEFAULT;
  if (recentRaw !== undefined) {
    const parsed = Number(recentRaw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > RECENT_MAX) {
      return c.json({ error: `recent must be an integer between 0 and ${RECENT_MAX}` }, 400);
    }
    recent = parsed;
  }

  const [feed, recentArticles] = await Promise.all([
    findFeedWithStats(c.env.DB, id),
    recent > 0 ? getRecentArticlesByFeed(c.env.DB, id, recent) : Promise.resolve([]),
  ]);

  if (!feed) {
    return c.json({ error: "feed not found" }, 404);
  }

  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
  return c.json<FeedDetailResponse>({ feed, recent_articles: recentArticles });
});

const DAYS_DEFAULT = 7;
const DAYS_MAX = 30;

app.get("/:id/health", async (c) => {
  const id = c.req.param("id");
  const daysRaw = c.req.query("days");

  // days バリデーション
  let days = DAYS_DEFAULT;
  if (daysRaw !== undefined) {
    const parsed = Number(daysRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > DAYS_MAX) {
      return c.json({ error: "invalid days" }, 400);
    }
    days = parsed;
  }

  // feeds.yaml に存在しない id は 404
  const allFeeds = loadAllFeeds();
  const feedConfig = allFeeds.find((f) => f.id === id);
  if (!feedConfig) {
    return c.json({ error: "feed not found" }, 404);
  }

  const health = await getFeedHealth(c.env.DB, id, days);

  const successRate =
    health.total_runs > 0
      ? Math.round((health.successful_runs / health.total_runs) * 1000) / 1000
      : null;

  const lastError =
    health.last_error_at !== null
      ? { at: health.last_error_at, message: health.last_error_message }
      : null;

  const lastRunStatus =
    health.last_run_status === "ok"
      ? "success"
      : health.last_run_status === "failed"
        ? "failed"
        : health.last_run_status === "skipped"
          ? "skipped"
          : null;

  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=900");
  return c.json<FeedRunHealthResponse>({
    feed_id: id,
    window_days: days,
    total_runs: health.total_runs,
    successful_runs: health.successful_runs,
    failed_runs: health.failed_runs,
    success_rate: successRate,
    last_run_at: health.last_run_at,
    last_run_status: lastRunStatus,
    last_error: lastError,
    avg_duration_ms: health.avg_duration_ms !== null ? Math.round(health.avg_duration_ms) : null,
    articles_inserted_total: health.articles_inserted_total ?? 0,
  });
});

export default app;
