import { Hono } from "hono";
import type { Env, FeedCategory, FeedLang } from "../types";
import { findFeedWithStats, getRecentArticlesByFeed, listFeedsWithStats } from "../db/feeds";

const app = new Hono<{ Bindings: Env }>();

const VALID_CATEGORIES = new Set<FeedCategory>(["bigtech", "ai", "jp", "zenn"]);
const VALID_LANGS = new Set<FeedLang>(["ja", "en"]);

app.get("/", async (c) => {
  const { req } = c;
  const categoryRaw = req.query("category");
  const langRaw = req.query("lang");
  const enabledRaw = req.query("enabled");

  // 不正なクエリパラメータは 400 を返す
  if (categoryRaw !== undefined && !VALID_CATEGORIES.has(categoryRaw as FeedCategory)) {
    return c.json({ error: `invalid category: ${categoryRaw}` }, 400);
  }
  if (langRaw !== undefined && !VALID_LANGS.has(langRaw as FeedLang)) {
    return c.json({ error: `invalid lang: ${langRaw}` }, 400);
  }
  if (enabledRaw !== undefined && enabledRaw !== "true" && enabledRaw !== "false") {
    return c.json({ error: `invalid enabled: ${enabledRaw}` }, 400);
  }

  const opts: { category?: FeedCategory; lang?: FeedLang; enabled?: boolean } = {};
  if (categoryRaw !== undefined) opts.category = categoryRaw as FeedCategory;
  if (langRaw !== undefined) opts.lang = langRaw as FeedLang;
  if (enabledRaw !== undefined) opts.enabled = enabledRaw === "true";

  const feeds = await listFeedsWithStats(c.env.DB, opts);
  return c.json({ feeds });
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

  c.header("Cache-Control", "public, max-age=300");
  return c.json({ feed, recent_articles: recentArticles });
});

export default app;
