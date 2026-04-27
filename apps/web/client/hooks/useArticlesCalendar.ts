import { useEffect, useState } from "react";
import type { CalendarDay } from "../types/api";

export function useArticlesCalendar(days: 30 | 90 | 365 = 90) {
  const [items, setItems] = useState<CalendarDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setIsLoading(true);
    setError(null);
    void (async () => {
      try {
        const res = await fetch(`/api/articles/calendar?days=${days}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { days: CalendarDay[] };
        if (alive) {
          setItems(data.days ?? []);
          setIsLoading(false);
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [days]);

  return { items, isLoading, error };
}
