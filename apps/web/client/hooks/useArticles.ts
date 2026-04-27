import { useCallback, useEffect, useRef, useState } from "react";
import type { Article, ArticlesResponse, FeedCategory, FeedLang } from "../types/api";

export interface ArticlesQuery {
  category?: FeedCategory;
  lang?: FeedLang;
  feedId?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
}

interface State {
  articles: Article[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
}

const initial: State = {
  articles: [],
  nextCursor: null,
  loading: false,
  loadingMore: false,
  error: null,
};

function buildUrl(query: ArticlesQuery, cursor?: string | null): string {
  const params = new URLSearchParams();
  if (query.category) params.set("category", query.category);
  if (query.lang) params.set("lang", query.lang);
  if (query.feedId) params.set("feed_id", query.feedId);
  if (query.q) params.set("q", query.q);
  if (query.dateFrom) params.set("date_from", query.dateFrom);
  if (query.dateTo) params.set("date_to", query.dateTo);
  if (cursor) params.set("cursor", cursor);
  params.set("limit", "20");
  return `/api/articles?${params.toString()}`;
}

export function useArticles(query: ArticlesQuery) {
  const [state, setState] = useState<State>(initial);
  const reqIdRef = useRef(0);

  const fetchInitial = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch(buildUrl(query));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ArticlesResponse;
      if (reqId !== reqIdRef.current) return;
      setState({
        articles: data.articles,
        nextCursor: data.nextCursor,
        loading: false,
        loadingMore: false,
        error: null,
      });
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setState({
        articles: [],
        nextCursor: null,
        loading: false,
        loadingMore: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, [query]);

  useEffect(() => {
    void fetchInitial();
  }, [fetchInitial]);

  const loadMore = useCallback(async () => {
    if (!state.nextCursor || state.loadingMore) return;
    const cursor = state.nextCursor;
    const reqId = reqIdRef.current;
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      const res = await fetch(buildUrl(query, cursor));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ArticlesResponse;
      if (reqId !== reqIdRef.current) return;
      setState((s) => ({
        articles: [...s.articles, ...data.articles],
        nextCursor: data.nextCursor,
        loading: false,
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
  }, [query, state.nextCursor, state.loadingMore]);

  return { ...state, loadMore, reload: fetchInitial };
}
