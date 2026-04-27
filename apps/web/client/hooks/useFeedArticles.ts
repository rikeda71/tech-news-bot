import { useCallback, useEffect, useRef, useState } from "react";
import type { Article, ArticlesResponse } from "../types/api";

interface State {
  articles: Article[];
  nextCursor: string | null;
  isLoading: boolean;
  loadingMore: boolean;
  error: string | null;
}

const initial: State = {
  articles: [],
  nextCursor: null,
  isLoading: false,
  loadingMore: false,
  error: null,
};

function buildUrl(feedId: string, limit: number, cursor?: string | null): string {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor) params.set("cursor", cursor);
  return `/api/articles/by-feed/${encodeURIComponent(feedId)}?${params.toString()}`;
}

export function useFeedArticles(feedId: string, limit = 20) {
  const [state, setState] = useState<State>(initial);
  const reqIdRef = useRef(0);

  const fetchInitial = useCallback(async () => {
    if (!feedId) return;
    const reqId = ++reqIdRef.current;
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      const res = await fetch(buildUrl(feedId, limit));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ArticlesResponse;
      if (reqId !== reqIdRef.current) return;
      setState({
        articles: data.articles,
        nextCursor: data.nextCursor,
        isLoading: false,
        loadingMore: false,
        error: null,
      });
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setState({
        articles: [],
        nextCursor: null,
        isLoading: false,
        loadingMore: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [feedId, limit]);

  useEffect(() => {
    void fetchInitial();
  }, [fetchInitial]);

  const loadMore = useCallback(async () => {
    if (!state.nextCursor || state.loadingMore) return;
    const cursor = state.nextCursor;
    const reqId = reqIdRef.current;
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      const res = await fetch(buildUrl(feedId, limit, cursor));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ArticlesResponse;
      if (reqId !== reqIdRef.current) return;
      setState((s) => ({
        articles: [...s.articles, ...data.articles],
        nextCursor: data.nextCursor,
        isLoading: false,
        loadingMore: false,
        error: null,
      }));
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setState((s) => ({
        ...s,
        loadingMore: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, [feedId, limit, state.nextCursor, state.loadingMore]);

  const hasMore = state.nextCursor !== null;
  return { ...state, hasMore, loadMore };
}
