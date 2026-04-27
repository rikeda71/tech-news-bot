import { Hono } from "hono";
import type { Context } from "hono";
import type { Env, FeedCategory, FeedLang, FeedsFile } from "../types";
import { listArticles } from "../db/articles";
import { computeSyndicationEtag } from "../utils/etag";
import { loadAllFeeds } from "../feed-config";
import feedsYaml from "../feeds.yaml";

const FEEDS_VERSION = (feedsYaml as FeedsFile).version;

const VALID_CATEGORIES: FeedCategory[] = ["bigtech", "ai", "jp", "zenn"];
const VALID_LANGS: FeedLang[] = ["ja", "en"];
const FEED_LIMIT = 50;
const SITE_TITLE = "Tech News Bot";
const SITE_DESCRIPTION = "Big tech / AI / 日本企業の technical blog を集約した RSS / JSON Feed";

// カテゴリごとの表示名 mapping
const CATEGORY_DISPLAY_NAMES: Record<FeedCategory, string> = {
  bigtech: "Big Tech",
  ai: "AI Labs",
  jp: "国内エンジニアリング",
  zenn: "Zenn",
};

const app = new Hono<{ Bindings: Env }>();

function parseFilters(c: { req: { query: (k: string) => string | undefined } }) {
  const categoryRaw = c.req.query("category");
  const langRaw = c.req.query("lang");
  const category =
    categoryRaw && (VALID_CATEGORIES as string[]).includes(categoryRaw)
      ? (categoryRaw as FeedCategory)
      : undefined;
  const lang =
    langRaw && (VALID_LANGS as string[]).includes(langRaw) ? (langRaw as FeedLang) : undefined;
  return { category, lang };
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
}

function siteOrigin(reqUrl: string): string {
  try {
    const u = new URL(reqUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

interface BuildFeedOpts {
  feedId?: string;
  category?: FeedCategory;
  lang?: FeedLang;
  /** feeds.yaml の name (per-feed 時に channel.title へ使用) */
  feedName?: string;
  /** カテゴリフィード用タイトル上書き (feedName が指定される場合は無視) */
  titleOverride?: string;
}

async function buildJsonFeed(
  c: Context<{ Bindings: Env }>,
  opts: BuildFeedOpts,
): Promise<Response> {
  const { feedId, category, lang, feedName, titleOverride } = opts;
  const etag = await computeSyndicationEtag(c.env.DB, FEEDS_VERSION, { category, lang, feedId });
  if (c.req.header("If-None-Match") === etag) {
    c.header("ETag", etag);
    c.header("Cache-Control", "public, max-age=60");
    return c.body(null, 304);
  }

  const result = await listArticles(c.env.DB, {
    category,
    lang,
    feedId,
    limit: FEED_LIMIT,
    cursor: null,
  });
  const origin = siteOrigin(c.req.url);
  const feedUrl = new URL(c.req.url).toString();
  const title = feedName ?? titleOverride ?? SITE_TITLE;
  const description = feedName ? `${feedName} の最新記事` : SITE_DESCRIPTION;

  const json = {
    version: "https://jsonfeed.org/version/1.1",
    title,
    description,
    home_page_url: origin || undefined,
    feed_url: feedUrl,
    language: lang ?? "und",
    items: result.articles.map((a) => ({
      id: a.guid,
      url: a.url,
      title: a.title,
      content_text: a.summary ?? "",
      summary: a.summary ?? undefined,
      date_published: a.published_at,
      authors: a.author ? [{ name: a.author }] : undefined,
      tags: [a.category, a.lang, ...(a.feed_name ? [a.feed_name] : [])],
      _feed_id: a.feed_id,
    })),
  };

  c.header("Content-Type", "application/feed+json; charset=utf-8");
  c.header("ETag", etag);
  c.header("Cache-Control", "public, max-age=60");
  return c.body(JSON.stringify(json));
}

async function buildAtomFeed(
  c: Context<{ Bindings: Env }>,
  opts: BuildFeedOpts,
): Promise<Response> {
  const { feedId, category, lang, feedName, titleOverride } = opts;
  const etag = await computeSyndicationEtag(c.env.DB, FEEDS_VERSION, { category, lang, feedId });
  if (c.req.header("If-None-Match") === etag) {
    c.header("ETag", etag);
    c.header("Cache-Control", "public, max-age=60");
    return c.body(null, 304);
  }

  const result = await listArticles(c.env.DB, {
    category,
    lang,
    feedId,
    limit: FEED_LIMIT,
    cursor: null,
  });
  const origin = siteOrigin(c.req.url);
  const feedUrl = new URL(c.req.url).toString();
  const feedPath = new URL(c.req.url).pathname;
  const hostname = new URL(c.req.url).hostname || "example.com";
  const year = new Date().getFullYear();
  const title = feedName ?? titleOverride ?? SITE_TITLE;
  const description = feedName ? `${feedName} の最新記事` : SITE_DESCRIPTION;
  const updated = result.articles[0]?.published_at ?? new Date().toISOString();

  const entries = result.articles
    .map((a) => {
      const authorName = a.author ?? a.feed_name ?? "";
      const parts = [
        `<entry>`,
        `<title>${escapeXml(a.title)}</title>`,
        `<id>${escapeXml(a.guid)}</id>`,
        `<link href="${escapeXml(a.url)}" rel="alternate"/>`,
        `<updated>${a.published_at}</updated>`,
        `<published>${a.published_at}</published>`,
      ];
      if (authorName) parts.push(`<author><name>${escapeXml(authorName)}</name></author>`);
      parts.push(`<category term="${escapeXml(a.category)}"/>`);
      if (a.summary) parts.push(`<summary type="html">${escapeXml(a.summary)}</summary>`);
      parts.push(`</entry>`);
      return parts.join("");
    })
    .join("");

  const xml =
    `<?xml version="1.0" encoding="utf-8"?>` +
    `<feed xmlns="http://www.w3.org/2005/Atom">` +
    `<title>${escapeXml(title)}</title>` +
    `<subtitle>${escapeXml(description)}</subtitle>` +
    `<link href="${escapeXml(origin)}/" rel="alternate"/>` +
    `<link href="${escapeXml(feedUrl)}" rel="self"/>` +
    `<id>tag:${escapeXml(hostname)},${year}:${escapeXml(feedPath)}</id>` +
    `<updated>${updated}</updated>` +
    `<generator uri="https://github.com/rikeda71/tech-news-bot">tech-news-bot</generator>` +
    entries +
    `</feed>`;

  c.header("Content-Type", "application/atom+xml; charset=utf-8");
  c.header("ETag", etag);
  c.header("Cache-Control", "public, max-age=60");
  return c.body(xml);
}

async function buildRssFeed(c: Context<{ Bindings: Env }>, opts: BuildFeedOpts): Promise<Response> {
  const { feedId, category, lang, feedName, titleOverride } = opts;
  const etag = await computeSyndicationEtag(c.env.DB, FEEDS_VERSION, { category, lang, feedId });
  if (c.req.header("If-None-Match") === etag) {
    c.header("ETag", etag);
    c.header("Cache-Control", "public, max-age=60");
    return c.body(null, 304);
  }

  const result = await listArticles(c.env.DB, {
    category,
    lang,
    feedId,
    limit: FEED_LIMIT,
    cursor: null,
  });
  const origin = siteOrigin(c.req.url);
  const feedUrl = new URL(c.req.url).toString();
  const lastBuild = result.articles[0]?.published_at ?? new Date().toISOString();
  const title = feedName ?? titleOverride ?? SITE_TITLE;
  const description = feedName ? `${feedName} の最新記事` : SITE_DESCRIPTION;

  const items = result.articles
    .map((a) => {
      const parts = [
        `<item>`,
        `<title>${escapeXml(a.title)}</title>`,
        `<link>${escapeXml(a.url)}</link>`,
        `<guid isPermaLink="false">${escapeXml(a.guid)}</guid>`,
        `<pubDate>${toRfc822(a.published_at)}</pubDate>`,
        `<category>${escapeXml(a.category)}</category>`,
      ];
      if (a.feed_name) parts.push(`<source>${escapeXml(a.feed_name)}</source>`);
      if (a.author) parts.push(`<author>${escapeXml(a.author)}</author>`);
      if (a.summary) parts.push(`<description>${escapeXml(a.summary)}</description>`);
      parts.push(`</item>`);
      return parts.join("");
    })
    .join("");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">` +
    `<channel>` +
    `<title>${escapeXml(title)}</title>` +
    `<link>${escapeXml(origin)}</link>` +
    `<description>${escapeXml(description)}</description>` +
    `<language>${escapeXml(lang ?? "und")}</language>` +
    `<lastBuildDate>${toRfc822(lastBuild)}</lastBuildDate>` +
    `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>` +
    items +
    `</channel></rss>`;

  c.header("Content-Type", "application/rss+xml; charset=utf-8");
  c.header("ETag", etag);
  c.header("Cache-Control", "public, max-age=60");
  return c.body(xml);
}

app.get("/feed.json", async (c) => {
  const { category, lang } = parseFilters(c);
  return buildJsonFeed(c, { category, lang });
});

app.get("/feed.xml", async (c) => {
  const { category, lang } = parseFilters(c);
  return buildRssFeed(c, { category, lang });
});

app.get("/feed.atom", async (c) => {
  const { category, lang } = parseFilters(c);
  return buildAtomFeed(c, { category, lang });
});

// カテゴリ別 syndication エンドポイント
// Hono の :param は非スラッシュ文字をすべて取り込むため、ワイルドカードで受け取り
// 拡張子とカテゴリ名を手動で分離する。
// /feeds/category/* を /feeds/:filename より先に登録することで優先マッチさせる。
app.get("/feeds/category/*", async (c) => {
  const pathname = new URL(c.req.url).pathname;
  const basename = pathname.replace(/^.*\/feeds\/category\//, "");

  let cat: FeedCategory;
  let format: "json" | "xml" | "atom";

  if (basename.endsWith(".json")) {
    cat = basename.slice(0, -5) as FeedCategory;
    format = "json";
  } else if (basename.endsWith(".xml")) {
    cat = basename.slice(0, -4) as FeedCategory;
    format = "xml";
  } else if (basename.endsWith(".atom")) {
    cat = basename.slice(0, -5) as FeedCategory;
    format = "atom";
  } else {
    return c.json({ error: "Not Found" }, 404);
  }

  if (!(VALID_CATEGORIES as string[]).includes(cat)) {
    return c.json({ error: "Not Found" }, 404);
  }

  const titleOverride = `${SITE_TITLE} — ${CATEGORY_DISPLAY_NAMES[cat]}`;

  if (format === "json") {
    return buildJsonFeed(c, { category: cat, titleOverride });
  }
  if (format === "atom") {
    return buildAtomFeed(c, { category: cat, titleOverride });
  }
  return buildRssFeed(c, { category: cat, titleOverride });
});

// per-feed エンドポイント: feeds.yaml に定義された id のみ受け付ける
// enabled: false でも過去記事の履歴閲覧ができるよう全フィードを対象とする
// ":id.xml" パターンは Hono の RegExpRouter でパラメータ解析が壊れることがあるため、
// ワイルドカードで受け取り拡張子を手動で分離する。
app.get("/feeds/:filename", async (c) => {
  const filename = c.req.param("filename");
  let feedId: string;
  let format: "xml" | "json" | "atom";

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

  if (format === "xml") {
    return buildRssFeed(c, { feedId, feedName: feedConfig.name, lang: feedConfig.lang });
  }
  if (format === "atom") {
    return buildAtomFeed(c, { feedId, feedName: feedConfig.name, lang: feedConfig.lang });
  }
  return buildJsonFeed(c, { feedId, feedName: feedConfig.name, lang: feedConfig.lang });
});

export default app;
