import { Hono } from "hono";
import type { Env, FeedCategory, FeedLang } from "../types";
import { listFeedsWithStats } from "../db/feeds";

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

export default app;
