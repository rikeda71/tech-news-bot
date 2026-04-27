import { Hono } from "hono";
import type { Env } from "../types";
import { loadAllFeeds } from "../feed-config";

const app = new Hono<{ Bindings: Env }>();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

app.get("/", async (c) => {
  const { req } = c;
  const limitRaw = req.query("limit");
  const cursorRaw = req.query("cursor");

  const limit = Math.min(
    Math.max(Number(limitRaw ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

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
  const allMerged = configFeeds.map((f) => {
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

  // cursor は id の base64 エンコード。cursor が指す id の次から返す。
  let startIdx = 0;
  if (cursorRaw) {
    try {
      const cursorId = atob(cursorRaw);
      const idx = allMerged.findIndex((f) => f.id === cursorId);
      // cursor の id が見つかった場合、その次の要素から返す
      if (idx !== -1) startIdx = idx + 1;
    } catch {
      // 不正な cursor は無視して先頭から返す
    }
  }

  const page = allMerged.slice(startIdx, startIdx + limit);
  const hasMore = startIdx + limit < allMerged.length;
  const nextCursor = hasMore ? btoa(page[page.length - 1].id) : null;

  return c.json({ feeds: page, nextCursor });
});

export default app;
