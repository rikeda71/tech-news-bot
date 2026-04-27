import { Hono } from "hono";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();

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

  return c.json({
    total: totalRow?.n ?? 0,
    last_published_at: totalRow?.last_published ?? null,
    last_fetched_at: totalRow?.last_fetched ?? null,
    last24h: recent?.n ?? 0,
    by_category: Object.fromEntries((byCategory.results ?? []).map((r) => [r.category, r.n])),
    by_lang: Object.fromEntries((byLang.results ?? []).map((r) => [r.lang, r.n])),
  });
});

export default app;
