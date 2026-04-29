import { toIso8601 } from "./shared";
import type { FeedMeta } from "./shared";

export function renderJsonFeed(meta: FeedMeta): { contentType: string; body: string } {
  const json = {
    version: "https://jsonfeed.org/version/1.1",
    title: meta.title,
    description: meta.description,
    home_page_url: meta.origin || undefined,
    feed_url: meta.feedUrl,
    language: meta.language,
    items: meta.articles.map((a) => ({
      id: a.guid,
      url: a.url,
      title: a.title,
      content_text: a.summary ?? "",
      summary: a.summary ?? undefined,
      // JSON Feed 1.1 は date_published を RFC 3339 と規定しているため
      // DB 値をそのまま使わず必ず有効な ISO 8601 に変換する
      date_published: toIso8601(a.published_at),
      authors: a.author ? [{ name: a.author }] : undefined,
      tags: [a.category, a.lang, ...(a.feed_name ? [a.feed_name] : [])],
      _feed_id: a.feed_id,
    })),
  };

  return {
    contentType: "application/feed+json; charset=utf-8",
    body: JSON.stringify(json),
  };
}
