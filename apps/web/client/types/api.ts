export type FeedCategory = "bigtech" | "ai" | "jp";
export type FeedLang = "ja" | "en";

export interface Article {
  id: number;
  guid: string;
  feed_id: string;
  feed_name: string | null;
  title: string;
  url: string;
  summary: string | null;
  author: string | null;
  published_at: string;
  fetched_at: string;
  category: FeedCategory;
  lang: FeedLang;
}

export interface ArticlesResponse {
  articles: Article[];
  nextCursor: string | null;
}

export interface FeedSummary {
  id: string;
  name: string;
  url: string;
  category: FeedCategory;
  lang: FeedLang;
  enabled: boolean;
  last_fetched_at: string | null;
  last_status: string | null;
  article_count: number;
}

export interface FeedsResponse {
  feeds: FeedSummary[];
}
