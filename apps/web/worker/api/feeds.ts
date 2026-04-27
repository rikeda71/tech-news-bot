import { Hono } from "hono";
import type { Env } from "../types";
import { loadAllFeeds } from "../feed-config";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  const configFeeds = loadAllFeeds();
  const result = await c.env.DB.prepare(
    `SELECT f.id, f.name, f.url, f.category, f.lang, f.enabled,
            f.last_fetched_at, f.last_status,
            (SELECT COUNT(*) FROM articles a WHERE a.feed_id = f.id) AS article_count
     FROM feeds f`,
  ).all<{
    id: string;
    name: string;
    url: string;
    category: string;
    lang: string;
    enabled: number;
    last_fetched_at: string | null;
    last_status: string | null;
    article_count: number;
  }>();

  const dbMap = new Map((result.results ?? []).map((r) => [r.id, r]));
  const merged = configFeeds.map((f) => {
    const db = dbMap.get(f.id);
    return {
      id: f.id,
      name: f.name,
      url: f.url,
      category: f.category,
      lang: f.lang,
      enabled: f.enabled,
      last_fetched_at: db?.last_fetched_at ?? null,
      last_status: db?.last_status ?? null,
      article_count: db?.article_count ?? 0,
    };
  });

  return c.json({ feeds: merged });
});

export default app;
