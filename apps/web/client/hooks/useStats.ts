import { useEffect, useState } from "react";

export interface StaleFeed {
  id: string;
  name: string;
  last_status: string | null;
  last_fetched_at: string | null;
  last_error: string | null;
}

export interface TrendPoint {
  date: string;
  ai: number;
  bigtech: number;
  jp: number;
  personal: number;
}

export interface FeedActivity {
  feed_id: string;
  feed_name: string;
  articles_30d: number;
  last_published_at: string | null;
}

export interface AuthorCount {
  author: string;
  count: number;
}

export interface PublisherCount {
  feed_id: string;
  name: string;
  count: number;
}

export interface Stats {
  total: number;
  last_published_at: string | null;
  last_fetched_at: string | null;
  last24h: number;
  by_category: Record<string, number>;
  by_lang: Record<string, number>;
  stale_feeds: StaleFeed[];
  category_trend_30d: TrendPoint[];
  feed_activity: FeedActivity[];
  // PR #148 で追加されたフィールド
  articles_24h?: number;
  articles_7d?: number;
  articles_30d?: number;
  top_authors_30d?: AuthorCount[];
  top_publishers_30d?: PublisherCount[];
  by_lang_30d?: Record<string, number>;
}

export function useStats(refreshSignal: number = 0) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Stats;
        if (alive) setStats(data);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshSignal]);

  return { stats, error };
}
