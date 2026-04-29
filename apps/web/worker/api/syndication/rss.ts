import { escapeXml, feedUpdatedAt, toRfc822 } from "./shared";
import type { FeedMeta } from "./shared";

export function renderRssFeed(meta: FeedMeta): { contentType: string; body: string } {
  const lastBuild = feedUpdatedAt(meta.articles);
  // RSS 2.0 の <channel><link> は必須要素。
  // siteOrigin() が空文字を返すケース（不正な URL など）では feedUrl の origin を代替使用する。
  let channelLink = meta.origin;
  if (!channelLink) {
    try {
      channelLink = new URL(meta.feedUrl).origin;
    } catch {
      channelLink = meta.feedUrl;
    }
  }

  const items = meta.articles
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

  const languageTag =
    meta.language !== undefined ? `<language>${escapeXml(meta.language)}</language>` : "";

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">` +
    `<channel>` +
    `<title>${escapeXml(meta.title)}</title>` +
    `<link>${escapeXml(channelLink)}</link>` +
    `<description>${escapeXml(meta.description)}</description>` +
    languageTag +
    `<lastBuildDate>${toRfc822(lastBuild)}</lastBuildDate>` +
    `<atom:link href="${escapeXml(meta.feedUrl)}" rel="self" type="application/rss+xml"/>` +
    items +
    `</channel></rss>`;

  return {
    contentType: "application/rss+xml; charset=utf-8",
    body: xml,
  };
}
