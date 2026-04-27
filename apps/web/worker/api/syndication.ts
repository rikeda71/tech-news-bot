import { Hono } from "hono";
import type { Env, FeedCategory, FeedLang } from "../types";
import { listArticles } from "../db/articles";

const VALID_CATEGORIES: FeedCategory[] = ["bigtech", "ai", "jp"];
const VALID_LANGS: FeedLang[] = ["ja", "en"];
const FEED_LIMIT = 50;
const SITE_TITLE = "tech-news-bot";
const SITE_DESCRIPTION = "Big tech / AI / 日本企業の technical blog を集約した RSS / JSON Feed";

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

app.get("/feed.json", async (c) => {
  const { category, lang } = parseFilters(c);
  const result = await listArticles(c.env.DB, {
    category,
    lang,
    limit: FEED_LIMIT,
    cursor: null,
  });
  const origin = siteOrigin(c.req.url);
  const feedUrl = new URL(c.req.url).toString();

  const json = {
    version: "https://jsonfeed.org/version/1.1",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
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
  c.header("Cache-Control", "public, max-age=300");
  return c.body(JSON.stringify(json));
});

app.get("/feed.xml", async (c) => {
  const { category, lang } = parseFilters(c);
  const result = await listArticles(c.env.DB, {
    category,
    lang,
    limit: FEED_LIMIT,
    cursor: null,
  });
  const origin = siteOrigin(c.req.url);
  const feedUrl = new URL(c.req.url).toString();
  const lastBuild = result.articles[0]?.published_at ?? new Date().toISOString();

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
    `<title>${escapeXml(SITE_TITLE)}</title>` +
    `<link>${escapeXml(origin)}</link>` +
    `<description>${escapeXml(SITE_DESCRIPTION)}</description>` +
    `<language>${escapeXml(lang ?? "und")}</language>` +
    `<lastBuildDate>${toRfc822(lastBuild)}</lastBuildDate>` +
    `<atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>` +
    items +
    `</channel></rss>`;

  c.header("Content-Type", "application/rss+xml; charset=utf-8");
  c.header("Cache-Control", "public, max-age=300");
  return c.body(xml);
});

export default app;
