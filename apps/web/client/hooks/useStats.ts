import { useEffect, useState } from "react";

export interface StaleFeed {
  id: string;
  name: string;
  last_status: string | null;
  last_fetched_at: string | null;
  last_error: string | null;
}

export interface Stats {
  total: number;
  last_published_at: string | null;
  last_fetched_at: string | null;
  last24h: number;
  by_category: Record<string, number>;
  by_lang: Record<string, number>;
  stale_feeds: StaleFeed[];
}

export function useStats(refreshSignal: number = 0) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
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
