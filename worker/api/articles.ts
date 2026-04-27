import { Hono } from "hono";
import type { Env } from "../types";
import type { FeedCategory, FeedLang } from "../../shared/types";
import { listArticles } from "../db/articles";
import { loadAllFeeds } from "../collector/feedLoader";

const app = new Hono<{ Bindings: Env }>();

const VALID_CATEGORIES: FeedCategory[] = ["bigtech", "ai", "jp"];
const VALID_LANGS: FeedLang[] = ["ja", "en"];
const VALID_FEED_IDS = new Set(loadAllFeeds().map((f) => f.id));

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

function decodeCursor(input: string | undefined): { publishedAt: string; id: number } | null {
  if (!input) return null;
  try {
    const decoded = atob(input);
    const parsed = JSON.parse(decoded);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.publishedAt === "string" &&
      ISO_RE.test(parsed.publishedAt) &&
      typeof parsed.id === "number" &&
      Number.isInteger(parsed.id) &&
      parsed.id >= 0
    ) {
      return { publishedAt: parsed.publishedAt, id: parsed.id };
    }
  } catch {
    return null;
  }
  return null;
}

function encodeCursor(cursor: { publishedAt: string; id: number } | null): string | null {
  if (!cursor) return null;
  return btoa(JSON.stringify(cursor));
}

app.get("/", async (c) => {
  const { req } = c;
  const categoryRaw = req.query("category");
  const langRaw = req.query("lang");
  const feedIdRaw = req.query("feed_id") ?? undefined;
  const feedId = feedIdRaw && VALID_FEED_IDS.has(feedIdRaw) ? feedIdRaw : undefined;
  const q = req.query("q") ?? undefined;
  const limitRaw = req.query("limit");
  const cursorRaw = req.query("cursor");

  const category =
    categoryRaw && (VALID_CATEGORIES as string[]).includes(categoryRaw)
      ? (categoryRaw as FeedCategory)
      : undefined;
  const lang =
    langRaw && (VALID_LANGS as string[]).includes(langRaw) ? (langRaw as FeedLang) : undefined;

  const limit = Math.min(Math.max(Number(limitRaw ?? "20") || 20, 1), 100);

  const result = await listArticles(c.env.DB, {
    category,
    lang,
    feedId,
    q,
    limit,
    cursor: decodeCursor(cursorRaw ?? undefined),
  });

  return c.json({
    articles: result.articles,
    nextCursor: encodeCursor(result.nextCursor),
  });
});

export default app;
