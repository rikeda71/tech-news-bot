import { Hono } from "hono";
import type { Env, FeedCategory, FeedLang } from "../types";
import { loadAllFeeds } from "../feed-config";
import {
  countArticlesByDay,
  countArticlesByMonth,
  getArticleById,
  getArticlesByAuthor,
  getArticlesByCategory,
  getArticlesByDay,
  getArticlesByFeed,
  getArticlesCalendar,
  getArticlesByMonth,
  getNeighbors,
  getRandomArticles,
  getRelatedArticles,
  listArticles,
  searchArticles,
} from "../db/articles";
import { computeArticlesEtag } from "../utils/etag";
import feedsYaml from "../feeds.yaml";
import type { FeedsFile } from "../types";
import type {
  ArticleArchiveResponse,
  ArticleByAuthorResponse,
  ArticleByCategoryResponse,
  ArticleByDayResponse,
  ArticleByFeedResponse,
  ArticleCalendarResponse,
  ArticleListResponse,
  ArticleNeighborsResponse,
  ArticleRandomResponse,
  ArticleRelatedResponse,
  ArticleSearchResponse,
} from "./types";
import { makeOneOf } from "../utils/types";

const FEEDS_VERSION = (feedsYaml as FeedsFile).version;

const app = new Hono<{ Bindings: Env }>();

const VALID_CATEGORIES = ["bigtech", "ai", "jp", "zenn"] as const satisfies readonly FeedCategory[];
const VALID_LANGS = ["ja", "en"] as const satisfies readonly FeedLang[];
const VALID_FEED_IDS = new Set(loadAllFeeds().map((f) => f.id));

const isCategory = makeOneOf<FeedCategory>(VALID_CATEGORIES);
const isLang = makeOneOf<FeedLang>(VALID_LANGS);

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
// YYYY-MM-DD または YYYY-MM-DDTHH:MM:SS 形式を受け付ける
const DATE_RANGE_RE = /^\d{4}-\d{2}-\d{2}/;

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

  const category = isCategory(categoryRaw) ? categoryRaw : undefined;
  const lang = isLang(langRaw) ? langRaw : undefined;

  const limit = Math.min(Math.max(Number(limitRaw ?? "20") || 20, 1), 100);

  const dateFromRaw = req.query("date_from") ?? undefined;
  const dateToRaw = req.query("date_to") ?? undefined;
  // 不正な値は silently drop する既存パターンに合わせる
  const dateFrom = dateFromRaw && DATE_RANGE_RE.test(dateFromRaw) ? dateFromRaw : undefined;
  const dateTo = dateToRaw && DATE_RANGE_RE.test(dateToRaw) ? dateToRaw : undefined;

  const etag = await computeArticlesEtag(c.env.DB, FEEDS_VERSION, {
    category,
    lang,
    feedId,
    q,
    limit,
    cursor: cursorRaw ?? null,
  });

  if (req.header("If-None-Match") === etag) {
    c.header("ETag", etag);
    c.header("Cache-Control", "public, max-age=60");
    return c.body(null, 304);
  }

  const result = await listArticles(c.env.DB, {
    category,
    lang,
    feedId,
    q,
    dateFrom,
    dateTo,
    limit,
    cursor: decodeCursor(cursorRaw ?? undefined),
  });

  c.header("ETag", etag);
  c.header("Cache-Control", "public, max-age=60");
  return c.json<ArticleListResponse>({
    articles: result.articles,
    nextCursor: encodeCursor(result.nextCursor),
  });
});

app.get("/random", async (c) => {
  const n = Number(c.req.query("n") ?? "10");
  if (!Number.isInteger(n) || n < 1 || n > 50) return c.json({ error: "n must be 1-50" }, 400);

  const categoryRaw = c.req.query("category");
  const langRaw = c.req.query("lang");
  const feedIdRaw = c.req.query("feed_id") ?? undefined;

  const category = isCategory(categoryRaw) ? categoryRaw : undefined;
  const lang = isLang(langRaw) ? langRaw : undefined;
  const feedId = feedIdRaw && VALID_FEED_IDS.has(feedIdRaw) ? feedIdRaw : undefined;

  const articles = await getRandomArticles(c.env.DB, { n, category, lang, feedId });
  return c.json<ArticleRandomResponse>({ articles }, 200, { "Cache-Control": "no-store" });
});

app.get("/by-author/:author", async (c) => {
  const authorRaw = c.req.param("author");
  const author = decodeURIComponent(authorRaw);
  if (!author) return c.json({ error: "author must not be empty" }, 400);

  const limitRaw = c.req.query("limit") ?? "20";
  const limitNum = Number(limitRaw);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 50) {
    return c.json({ error: "limit must be an integer between 1 and 50" }, 400);
  }

  const cursorRaw = c.req.query("cursor");
  const cursor = decodeCursor(cursorRaw);
  // cursor が指定されているのに decode に失敗した場合は 400
  if (cursorRaw && !cursor) return c.json({ error: "invalid cursor" }, 400);

  const result = await getArticlesByAuthor(c.env.DB, author, limitNum, cursor);

  return c.json<ArticleByAuthorResponse>(
    { articles: result.articles, next_cursor: encodeCursor(result.nextCursor) },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
});

app.get("/by-feed/:feedId", async (c) => {
  const feedIdRaw = c.req.param("feedId");
  const feedId = decodeURIComponent(feedIdRaw).trim();
  if (!feedId) return c.json({ error: "feedId must not be empty" }, 400);

  const limitRaw = c.req.query("limit") ?? "20";
  const limitNum = Number(limitRaw);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 50) {
    return c.json({ error: "limit must be an integer between 1 and 50" }, 400);
  }

  const cursorRaw = c.req.query("cursor");
  const cursor = decodeCursor(cursorRaw);
  // cursor が指定されているのに decode に失敗した場合は 400
  if (cursorRaw && !cursor) return c.json({ error: "invalid cursor" }, 400);

  const result = await getArticlesByFeed(c.env.DB, feedId, limitNum, cursor);

  return c.json<ArticleByFeedResponse>(
    { articles: result.articles, next_cursor: encodeCursor(result.nextCursor) },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
});

app.get("/by-category/:cat", async (c) => {
  const catRaw = c.req.param("cat");
  if (!isCategory(catRaw)) {
    return c.json({ error: "invalid category: must be one of bigtech, ai, jp, zenn" }, 400);
  }
  const category = catRaw;

  const limitRaw = c.req.query("limit") ?? "20";
  const limitNum = Number(limitRaw);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 50) {
    return c.json({ error: "limit must be an integer between 1 and 50" }, 400);
  }

  const cursorRaw = c.req.query("cursor");
  const cursor = decodeCursor(cursorRaw);
  // cursor が指定されているのに decode に失敗した場合は 400
  if (cursorRaw && !cursor) return c.json({ error: "invalid cursor" }, 400);

  const result = await getArticlesByCategory(c.env.DB, category, limitNum, cursor);

  return c.json<ArticleByCategoryResponse>(
    { articles: result.articles, next_cursor: encodeCursor(result.nextCursor) },
    200,
    { "Cache-Control": "public, max-age=300" },
  );
});

const VALID_CALENDAR_DAYS = [7, 30, 90, 365] as const;

app.get("/calendar", async (c) => {
  const daysRaw = c.req.query("days") ?? "30";
  const days = parseInt(daysRaw, 10);
  if (isNaN(days) || !(VALID_CALENDAR_DAYS as readonly number[]).includes(days)) {
    return c.json({ error: "days must be one of 7, 30, 90, 365" }, 400);
  }

  const categoryRaw = c.req.query("category");
  if (categoryRaw !== undefined && !isCategory(categoryRaw)) {
    return c.json({ error: "invalid category" }, 400);
  }
  const category = isCategory(categoryRaw) ? categoryRaw : undefined;

  const langRaw = c.req.query("lang");
  if (langRaw !== undefined && !isLang(langRaw)) {
    return c.json({ error: "invalid lang" }, 400);
  }
  const lang = isLang(langRaw) ? langRaw : undefined;

  const items = await getArticlesCalendar(c.env.DB, days, lang, category);

  return c.json<ArticleCalendarResponse>({ days, items }, 200, {
    "Cache-Control": "public, max-age=600",
  });
});

const MAX_SEARCH_TOKENS = 5;
const MAX_TOKEN_LEN = 50;

app.get("/search", async (c) => {
  const qRaw = c.req.query("q");
  if (!qRaw || !qRaw.trim()) return c.json({ error: "missing q" }, 400);

  // lower-case + trim してトークン分割
  const tokens = qRaw.trim().toLowerCase().split(/\s+/).filter(Boolean);

  if (tokens.length === 0 || tokens.length > MAX_SEARCH_TOKENS) {
    return c.json({ error: `q must have 1 to ${MAX_SEARCH_TOKENS} tokens` }, 400);
  }
  for (const token of tokens) {
    if (token.length < 1 || token.length > MAX_TOKEN_LEN) {
      return c.json({ error: `each token must be 1 to ${MAX_TOKEN_LEN} characters` }, 400);
    }
  }

  const limitRaw = c.req.query("limit") ?? "50";
  const limitNum = Number(limitRaw);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
    return c.json({ error: "limit must be an integer between 1 and 100" }, 400);
  }

  const cursorRaw = c.req.query("cursor");
  const cursor = decodeCursor(cursorRaw);
  if (cursorRaw && !cursor) return c.json({ error: "invalid cursor" }, 400);

  const result = await searchArticles(c.env.DB, tokens, limitNum, cursor);

  return c.json<ArticleSearchResponse>(
    {
      query: tokens.join(" "),
      tokens,
      articles: result.articles,
      next_cursor: encodeCursor(result.nextCursor),
    },
    200,
    { "Cache-Control": "public, max-age=120" },
  );
});

app.get("/:guid/related", async (c) => {
  const guid = c.req.param("guid");
  const nRaw = c.req.query("n") ?? "5";
  const n = Number(nRaw);
  if (!Number.isInteger(n) || n < 1 || n > 20) return c.json({ error: "n must be 1-20" }, 400);

  const items = await getRelatedArticles(c.env.DB, guid, n);
  if (items === null) return c.json({ error: "not found" }, 404);
  return c.json<ArticleRelatedResponse>({ items }, 200, { "Cache-Control": "public, max-age=300" });
});

app.get("/:guid/neighbors", async (c) => {
  const guid = c.req.param("guid");
  const neighbors = await getNeighbors(c.env.DB, guid);
  if (neighbors === null) return c.json({ error: "not found" }, 404);
  return c.json<ArticleNeighborsResponse>(neighbors, 200, {
    "Cache-Control": "public, max-age=300",
  });
});

app.get("/archive", async (c) => {
  const yearRaw = c.req.query("year") ?? "";
  const monthRaw = c.req.query("month") ?? "";

  const year = parseInt(yearRaw, 10);
  if (isNaN(year) || year < 2000 || year > 2100) {
    return c.json({ error: "year must be an integer between 2000 and 2100" }, 400);
  }

  const month = parseInt(monthRaw, 10);
  if (isNaN(month) || month < 1 || month > 12) {
    return c.json({ error: "month must be an integer between 1 and 12" }, 400);
  }

  const categoryRaw = c.req.query("category");
  if (categoryRaw !== undefined && !isCategory(categoryRaw)) {
    return c.json({ error: "invalid category" }, 400);
  }
  const category = isCategory(categoryRaw) ? categoryRaw : undefined;

  const langRaw = c.req.query("lang");
  if (langRaw !== undefined && !isLang(langRaw)) {
    return c.json({ error: "invalid lang" }, 400);
  }
  const lang = isLang(langRaw) ? langRaw : undefined;

  const limitRaw = c.req.query("limit") ?? "200";
  const limit = parseInt(limitRaw, 10);
  if (isNaN(limit) || limit < 1 || limit > 500) {
    return c.json({ error: "limit must be an integer between 1 and 500" }, 400);
  }

  const [items, total] = await Promise.all([
    getArticlesByMonth(c.env.DB, year, month, { category, lang, limit }),
    countArticlesByMonth(c.env.DB, year, month, { category, lang }),
  ]);

  return c.json<ArticleArchiveResponse>({ year, month, items, total }, 200, {
    "Cache-Control": "public, max-age=600",
  });
});

// YYYY-MM-DD 形式のみ受け付ける。time コンポーネントは不要
const DATE_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

app.get("/by-day/:date", async (c) => {
  const dateRaw = c.req.param("date");

  if (!DATE_DAY_RE.test(dateRaw)) {
    return c.json({ error: "invalid date" }, 400);
  }

  const year = parseInt(dateRaw.slice(0, 4), 10);
  if (year < 1900 || year > 2100) {
    return c.json({ error: "invalid date" }, 400);
  }

  const limitRaw = c.req.query("limit") ?? "50";
  const limitNum = Number(limitRaw);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > 100) {
    return c.json({ error: "limit must be an integer between 1 and 100" }, 400);
  }

  const cursorRaw = c.req.query("cursor");
  const cursor = decodeCursor(cursorRaw);
  // cursor が指定されているのに decode に失敗した場合は 400
  if (cursorRaw && !cursor) return c.json({ error: "invalid cursor" }, 400);

  // handler 側で UTC の日付境界文字列を計算して DB に渡す
  const [yStr, mStr, dStr] = dateRaw.split("-");
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10) - 1; // Date.UTC は 0 始まり
  const d = parseInt(dStr, 10);
  const startIso = new Date(Date.UTC(y, m, d)).toISOString();
  const endIso = new Date(Date.UTC(y, m, d + 1)).toISOString();

  const [result, total] = await Promise.all([
    getArticlesByDay(c.env.DB, startIso, endIso, limitNum, cursor),
    countArticlesByDay(c.env.DB, startIso, endIso),
  ]);

  return c.json<ArticleByDayResponse>(
    {
      date: dateRaw,
      articles: result.articles,
      next_cursor: encodeCursor(result.nextCursor),
      total,
    },
    200,
    { "Cache-Control": "public, max-age=600" },
  );
});

app.get("/:id", async (c) => {
  const idStr = c.req.param("id");
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "invalid id" }, 400);
  const article = await getArticleById(c.env.DB, id);
  if (!article) return c.json({ error: "not found" }, 404);
  const etag = `W/"${article.id}-${article.fetched_at}"`;
  if (c.req.header("If-None-Match") === etag) return c.body(null, 304);
  return c.json(article, 200, { ETag: etag, "Cache-Control": "public, max-age=60" });
});

export default app;
