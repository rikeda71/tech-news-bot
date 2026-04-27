import { useEffect, useState } from "react";
import type { Article, FeedDetail, FeedDetailResponse } from "../types/api";

interface UseFeedDetailResult {
  feed: FeedDetail | null;
  articles: Article[];
  isLoading: boolean;
  error: string | null;
}

export function useFeedDetail(feedId: string): UseFeedDetailResult {
  const [feed, setFeed] = useState<FeedDetail | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setError(null);
    setFeed(null);
    setArticles([]);

    void (async () => {
      try {
        const res = await fetch(`/api/feeds/${feedId}?recent=20`);
        if (!res.ok) {
          // 404 は専用メッセージで区別する
          const msg = res.status === 404 ? "feed_not_found" : `HTTP ${res.status}`;
          if (alive) setError(msg);
          return;
        }
        const data = (await res.json()) as FeedDetailResponse;
        if (alive) {
          setFeed(data.feed);
          setArticles(data.recent_articles);
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setIsLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [feedId]);

  return { feed, articles, isLoading, error };
}
