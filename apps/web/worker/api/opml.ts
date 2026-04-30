import { Hono } from "hono";
import type { Env, FeedCategory } from "../types";
import { loadEnabledFeeds } from "../feed-config";

const OPML_TITLE = "Tech News Bot — Subscriptions";

// カテゴリごとの表示名 mapping
const CATEGORY_DISPLAY_NAMES: Record<FeedCategory, string> = {
  bigtech: "Big Tech",
  ai: "AI Labs",
  jp: "国内エンジニアリング",
  personal: "個人ブログ",
};

// カテゴリの表示順序
const CATEGORY_ORDER: FeedCategory[] = ["bigtech", "ai", "jp", "personal"];

function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function computeOpmlEtag(
  feeds: { id: string; name: string; url: string; category: FeedCategory }[],
): Promise<string> {
  const source = feeds.map((f) => `${f.id}|${f.name}|${f.url}|${f.category}`).join(",");
  const encoded = new TextEncoder().encode(source);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `W/"${hex.slice(0, 16)}"`;
}

function buildOpmlXml(origin: string, feeds: ReturnType<typeof loadEnabledFeeds>): string {
  const dateCreated = new Date().toUTCString();

  // カテゴリ別にグループ化
  const byCategory = new Map<FeedCategory, typeof feeds>();
  for (const cat of CATEGORY_ORDER) {
    byCategory.set(cat, []);
  }
  for (const feed of feeds) {
    byCategory.get(feed.category)?.push(feed);
  }

  const outlineGroups = CATEGORY_ORDER.filter((cat) => (byCategory.get(cat)?.length ?? 0) > 0)
    .map((cat) => {
      const displayName = escapeXml(CATEGORY_DISPLAY_NAMES[cat]);
      const children = (byCategory.get(cat) ?? [])
        .map((feed) => {
          const xmlUrl = escapeXml(`${origin}/feeds/${feed.id}.xml`);
          const htmlUrl = escapeXml(feed.url);
          const text = escapeXml(feed.name);
          return `<outline type="rss" text="${text}" title="${text}" xmlUrl="${xmlUrl}" htmlUrl="${htmlUrl}"/>`;
        })
        .join("");
      return `<outline text="${displayName}" title="${displayName}">${children}</outline>`;
    })
    .join("");

  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<opml version="2.0">` +
    `<head>` +
    `<title>${escapeXml(OPML_TITLE)}</title>` +
    `<dateCreated>${dateCreated}</dateCreated>` +
    `</head>` +
    `<body>${outlineGroups}</body>` +
    `</opml>`
  );
}

const app = new Hono<{ Bindings: Env }>();

app.get("/feeds.opml", async (c) => {
  const feeds = loadEnabledFeeds();
  const etag = await computeOpmlEtag(feeds);

  if (c.req.header("If-None-Match") === etag) {
    c.header("ETag", etag);
    c.header("Cache-Control", "public, max-age=3600");
    return c.body(null, 304);
  }

  const origin = new URL(c.req.url).origin;
  const xml = buildOpmlXml(origin, feeds);

  c.header("Content-Type", "text/x-opml; charset=utf-8");
  c.header("ETag", etag);
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(xml);
});

export default app;
