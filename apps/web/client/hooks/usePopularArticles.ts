import { useEffect, useState } from "react";
import type { Article } from "../types/api";

const STORAGE_KEY = "tnb:trending:days";
const VALID_DAYS = [7, 14, 30] as const;
export type TrendingDays = (typeof VALID_DAYS)[number];

function loadDays(): TrendingDays {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const n = Number(raw);
    return (VALID_DAYS as readonly number[]).includes(n) ? (n as TrendingDays) : 7;
  } catch {
    return 7;
  }
}

function saveDays(days: TrendingDays): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(days));
  } catch {
    // localStorage が使えない環境では無視
  }
}

export interface PopularArticlesResponse {
  articles: Article[];
  window_days: number;
  total: number;
}

interface State {
  articles: Article[];
  total: number;
  isLoading: boolean;
  error: string | null;
}

const initialState: State = {
  articles: [],
  total: 0,
  isLoading: false,
  error: null,
};

export function usePopularArticles(limit = 30) {
  const [days, setDaysState] = useState<TrendingDays>(loadDays);
  const [state, setState] = useState<State>(initialState);

  const setDays = (next: TrendingDays) => {
    saveDays(next);
    setDaysState(next);
  };

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    void (async () => {
      try {
        const params = new URLSearchParams();
        params.set("days", String(days));
        params.set("limit", String(limit));
        const res = await fetch(`/api/articles/popular?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PopularArticlesResponse;
        if (alive) {
          setState({
            articles: data.articles,
            total: data.total,
            isLoading: false,
            error: null,
          });
        }
      } catch (err) {
        if (alive) {
          setState({
            articles: [],
            total: 0,
            isLoading: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [days, limit]);

  return { ...state, days, setDays };
}
