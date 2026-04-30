import { Hono } from "hono";
import type { Context } from "hono";
import type { Article, Env, FeedCategory, FeedLang, FeedsFile } from "../types";
import { listArticles } from "../db/articles";
import { computeSyndicationEtag } from "../utils/etag";
import { loadAllFeeds } from "../feed-config";
import feedsYaml from "../feeds.yaml";
import { buildUrlParts } from "./syndication/shared";
import type { FeedMeta } from "./syndication/shared";
import { renderJsonFeed } from "./syndication/json";
import { renderAtomFeed } from "./syndication/atom";
import { renderRssFeed } from "./syndication/rss";
import { isCategory, isLang } from "./_guards";

const FEEDS_VERSION = (feedsYaml as FeedsFile).version;
const FEED_LIMIT = 50;
const SITE_TITLE = "Tech News Bot";
const SITE_DESCRIPTION = "Big tech / AI / 日本企業の technical blog を集約した RSS / JSON Feed";

// カテゴリごとの表示名 mapping
const CATEGORY_DISPLAY_NAMES: Record<FeedCategory, string> = {
  bigtech: "Big Tech",
  ai: "AI Labs",
  jp: "国内エンジニアリング",
  personal: "個人ブログ",
};

// 言語ごとの表示名 mapping
const LANG_DISPLAY_NAMES: Record<FeedLang, string> = {
  ja: "日本語のテック記事 - tech-news-bot",
  en: "English Tech Articles - tech-news-bot",
};

const app = new Hono<{ Bindings: Env }>();

type Format = "json" | "xml" | "atom";

function parseFilters(c: { req: { query: (k: string) => string | undefined } }) {
  const categoryRaw = c.req.query("category");
  const langRaw = c.req.query("lang");
  const category = isCategory(categoryRaw) ? categoryRaw : undefined;
  const lang = isLang(langRaw) ? langRaw : undefined;
  return { category, lang };
}

/** ETag 照合 → 304 を返す。一致しなければ null を返す */
async function checkEtag(
  c: Context<{ Bindings: Env }>,
  etag: string,
  cacheMaxAge: number,
): Promise<Response | null> {
  if (c.req.header("If-None-Match") === etag) {
    c.header("ETag", etag);
    c.header("Cache-Control", `public, max-age=${cacheMaxAge}`);
    return c.body(null, 304);
  }
  return null;
}

/** renderer の結果を Hono レスポンスに変換する */
function renderResponse(
  c: Context<{ Bindings: Env }>,
  rendered: { contentType: string; body: string },
  etag: string,
  cacheMaxAge: number,
): Response {
  c.header("Content-Type", rendered.contentType);
  c.header("ETag", etag);
  c.header("Cache-Control", `public, max-age=${cacheMaxAge}`);
  return c.body(rendered.body);
}

/** format に応じた renderer を呼び出す */
function render(format: Format, meta: FeedMeta): { contentType: string; body: string } {
  if (format === "json") return renderJsonFeed(meta);
  if (format === "atom") return renderAtomFeed(meta);
  return renderRssFeed(meta);
}

// --- 著者別記事取得: db/articles.ts を変更せず syndication 層で直接クエリする ---
async function fetchArticlesByAuthor(db: D1Database, author: string): Promise<Article[]> {
  const result = await db
    .prepare(
      `SELECT a.id, a.guid, a.feed_id, f.name AS feed_name, a.title, a.url, a.summary,
              a.author, a.published_at, a.fetched_at, a.category, a.lang
       FROM articles a
       LEFT JOIN feeds f ON f.id = a.feed_id
       WHERE a.author = ?1
       ORDER BY a.published_at DESC, a.id DESC
       LIMIT ?2`,
    )
    .bind(author, FEED_LIMIT)
    .all<Article>();
  return result.results ?? [];
}

// ----------------------------- Routes --------------------------------

app.get("/feed.json", async (c) => {
  const { category, lang } = parseFilters(c);
  const etag = await computeSyndicationEtag(c.env.DB, FEEDS_VERSION, { category, lang });
  const notModified = await checkEtag(c, etag, 60);
  if (notModified) return notModified;

  const result = await listArticles(c.env.DB, { category, lang, limit: FEED_LIMIT, cursor: null });
  const urlParts = buildUrlParts(c.req.url);
  const meta: FeedMeta = {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    language: lang ?? "und",
    ...urlParts,
    articles: result.articles,
  };
  return renderResponse(c, renderJsonFeed(meta), etag, 60);
});

app.get("/feed.xml", async (c) => {
  const { category, lang } = parseFilters(c);
  const etag = await computeSyndicationEtag(c.env.DB, FEEDS_VERSION, { category, lang });
  const notModified = await checkEtag(c, etag, 60);
  if (notModified) return notModified;

  const result = await listArticles(c.env.DB, { category, lang, limit: FEED_LIMIT, cursor: null });
  const urlParts = buildUrlParts(c.req.url);
  const meta: FeedMeta = {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    language: lang ?? "und",
    ...urlParts,
    articles: result.articles,
  };
  return renderResponse(c, renderRssFeed(meta), etag, 60);
});

app.get("/feed.atom", async (c) => {
  const { category, lang } = parseFilters(c);
  const etag = await computeSyndicationEtag(c.env.DB, FEEDS_VERSION, { category, lang });
  const notModified = await checkEtag(c, etag, 60);
  if (notModified) return notModified;

  const result = await listArticles(c.env.DB, { category, lang, limit: FEED_LIMIT, cursor: null });
  const urlParts = buildUrlParts(c.req.url);
  const meta: FeedMeta = {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    language: lang,
    ...urlParts,
    articles: result.articles,
  };
  return renderResponse(c, renderAtomFeed(meta), etag, 60);
});

// カテゴリ別 syndication エンドポイント
// Hono の :param は非スラッシュ文字をすべて取り込むため、ワイルドカードで受け取り
// 拡張子とカテゴリ名を手動で分離する。
// /feeds/category/* を /feeds/:filename より先に登録することで優先マッチさせる。
app.get("/feeds/category/*", async (c) => {
  const pathname = new URL(c.req.url).pathname;
  const basename = pathname.replace(/^.*\/feeds\/category\//, "");

  let rawCat: string;
  let format: Format;
  if (basename.endsWith(".json")) {
    rawCat = basename.slice(0, -5);
    format = "json";
  } else if (basename.endsWith(".xml")) {
    rawCat = basename.slice(0, -4);
    format = "xml";
  } else if (basename.endsWith(".atom")) {
    rawCat = basename.slice(0, -5);
    format = "atom";
  } else {
    return c.json({ error: "Not Found" }, 404);
  }

  if (!isCategory(rawCat)) {
    return c.json({ error: "Not Found" }, 404);
  }
  const cat = rawCat;
  const titleOverride = `${SITE_TITLE} — ${CATEGORY_DISPLAY_NAMES[cat]}`;

  const etag = await computeSyndicationEtag(c.env.DB, FEEDS_VERSION, { category: cat });
  const notModified = await checkEtag(c, etag, 60);
  if (notModified) return notModified;

  const result = await listArticles(c.env.DB, {
    category: cat,
    limit: FEED_LIMIT,
    cursor: null,
  });
  const urlParts = buildUrlParts(c.req.url);
  const meta: FeedMeta = {
    title: titleOverride,
    description: SITE_DESCRIPTION,
    language: "und",
    ...urlParts,
    articles: result.articles,
  };
  return renderResponse(c, render(format, meta), etag, 60);
});

// 著者別 syndication エンドポイント
// /feeds/category/* と同様、/feeds/:filename より先に登録することで優先マッチさせる。
// author は URL decode して大文字小文字を区別する完全一致で検索する。
// 0 件でも 200 で空 feed を返す (RSS リーダーが定期 polling するため 404 にしない)。
app.get("/feeds/author/*", async (c) => {
  const pathname = new URL(c.req.url).pathname;
  const basename = pathname.replace(/^.*\/feeds\/author\//, "");

  let rawAuthor: string;
  let format: Format;

  if (basename.endsWith(".json")) {
    rawAuthor = basename.slice(0, -5);
    format = "json";
  } else if (basename.endsWith(".xml")) {
    rawAuthor = basename.slice(0, -4);
    format = "xml";
  } else if (basename.endsWith(".atom")) {
    rawAuthor = basename.slice(0, -5);
    format = "atom";
  } else {
    return c.json({ error: "Not Found" }, 404);
  }

  const author = decodeURIComponent(rawAuthor);
  const title = `${author} - tech-news-bot`;
  const description = `${author} の最新記事`;

  const etag = await computeSyndicationEtag(c.env.DB, FEEDS_VERSION, { author });
  const notModified = await checkEtag(c, etag, 600);
  if (notModified) return notModified;

  const articles = await fetchArticlesByAuthor(c.env.DB, author);
  const urlParts = buildUrlParts(c.req.url);
  const meta: FeedMeta = {
    title,
    description,
    // author フィードは言語混在のため language フィールドを省略
    language: undefined,
    ...urlParts,
    articles,
  };
  return renderResponse(c, render(format, meta), etag, 600);
});

// 言語別 syndication エンドポイント
// :lang は "ja" / "en" のみ受け付け、それ以外は 404。
// /feeds/category/* / /feeds/author/* と同様、/feeds/:filename より前に登録する。
app.get("/feeds/lang/*", async (c) => {
  const pathname = new URL(c.req.url).pathname;
  const basename = pathname.replace(/^.*\/feeds\/lang\//, "");

  let rawLang: string;
  let format: Format;
  if (basename.endsWith(".json")) {
    rawLang = basename.slice(0, -5);
    format = "json";
  } else if (basename.endsWith(".xml")) {
    rawLang = basename.slice(0, -4);
    format = "xml";
  } else if (basename.endsWith(".atom")) {
    rawLang = basename.slice(0, -5);
    format = "atom";
  } else {
    return c.json({ error: "Not Found" }, 404);
  }

  if (!isLang(rawLang)) {
    return c.json({ error: "Not Found" }, 404);
  }
  const lang = rawLang;
  const title = LANG_DISPLAY_NAMES[lang];

  const etag = await computeSyndicationEtag(c.env.DB, FEEDS_VERSION, { lang });
  const notModified = await checkEtag(c, etag, 600);
  if (notModified) return notModified;

  const result = await listArticles(c.env.DB, { lang, limit: FEED_LIMIT, cursor: null });
  const urlParts = buildUrlParts(c.req.url);
  const meta: FeedMeta = {
    title,
    // lang フィードは title を description にも使う (元の実装に合わせる)
    description: title,
    language: lang,
    ...urlParts,
    articles: result.articles,
  };
  return renderResponse(c, render(format, meta), etag, 600);
});

// per-feed エンドポイント: feeds.yaml に定義された id のみ受け付ける
// enabled: false でも過去記事の履歴閲覧ができるよう全フィードを対象とする
// ":id.xml" パターンは Hono の RegExpRouter でパラメータ解析が壊れることがあるため、
// ワイルドカードで受け取り拡張子を手動で分離する。
app.get("/feeds/:filename", async (c) => {
  const filename = c.req.param("filename");
  let feedId: string;
  let format: Format;

  if (filename.endsWith(".xml")) {
    feedId = filename.slice(0, -4);
    format = "xml";
  } else if (filename.endsWith(".json")) {
    feedId = filename.slice(0, -5);
    format = "json";
  } else if (filename.endsWith(".atom")) {
    feedId = filename.slice(0, -5);
    format = "atom";
  } else {
    return c.notFound();
  }

  const feedConfig = loadAllFeeds().find((f) => f.id === feedId);
  if (!feedConfig) return c.notFound();

  const etag = await computeSyndicationEtag(c.env.DB, FEEDS_VERSION, {
    feedId,
    lang: feedConfig.lang,
  });
  const notModified = await checkEtag(c, etag, 60);
  if (notModified) return notModified;

  const result = await listArticles(c.env.DB, {
    feedId,
    lang: feedConfig.lang,
    limit: FEED_LIMIT,
    cursor: null,
  });
  const urlParts = buildUrlParts(c.req.url);
  const meta: FeedMeta = {
    title: feedConfig.name,
    description: `${feedConfig.name} の最新記事`,
    language: feedConfig.lang,
    ...urlParts,
    articles: result.articles,
  };
  return renderResponse(c, render(format, meta), etag, 60);
});

export default app;
