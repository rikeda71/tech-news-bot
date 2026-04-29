import { escapeXml } from "./shared";
import type { FeedMeta } from "./shared";

export function renderAtomFeed(meta: FeedMeta): { contentType: string; body: string } {
  const updated = meta.articles[0]?.published_at ?? new Date().toISOString();

  const entries = meta.articles
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
    `<title>${escapeXml(meta.title)}</title>` +
    `<subtitle>${escapeXml(meta.description)}</subtitle>` +
    `<link href="${escapeXml(meta.origin)}/" rel="alternate"/>` +
    `<link href="${escapeXml(meta.feedUrl)}" rel="self"/>` +
    `<id>tag:${escapeXml(meta.hostname)},${meta.year}:${escapeXml(meta.feedPath)}</id>` +
    `<updated>${updated}</updated>` +
    `<generator uri="https://github.com/rikeda71/tech-news-bot">tech-news-bot</generator>` +
    entries +
    `</feed>`;

  return {
    contentType: "application/atom+xml; charset=utf-8",
    body: xml,
  };
}
