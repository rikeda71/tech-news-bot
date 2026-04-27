import { useEffect, useState } from "react";
import type { FeedsResponse, FeedSummary } from "../types/api";

export function useFeeds() {
  const [feeds, setFeeds] = useState<FeedSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/feeds");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as FeedsResponse;
        if (!alive) return;
        setFeeds(data.feeds);
        setError(null);
      } catch (err) {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return { feeds, loading, error };
}
