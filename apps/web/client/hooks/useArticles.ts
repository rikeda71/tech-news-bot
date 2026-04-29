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

// クライアントフィルタが ON の時、この件数を下回ると自動 loadMore を発火する
const MIN_VISIBLE = 10;
// D1 free tier の reads 上限を意識し、連続自動ロード回数を制限する
const AUTO_LOAD_MAX = 5;

interface State {
  articles: Article[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  autoLoadCount: number;
}

const initial: State = {
  articles: [],
  nextCursor: null,
  loading: false,
  loadingMore: false,
  error: null,
  autoLoadCount: 0,
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

export interface AutoLoadOptions {
  // クライアントフィルタ後の表示件数 (フィルタ OFF 時は allArticles.length と同じ)
  filteredLength: number;
  // unreadOnly / starredOnly / bookmarksOnly のいずれかが ON
  isFilterActive: boolean;
}

export function useArticles(query: ArticlesQuery, autoLoad: AutoLoadOptions) {
  const [state, setState] = useState<State>(initial);
  const reqIdRef = useRef(0);
  // autoLoad は毎レンダリングで新規オブジェクトになるため ref で保持して useEffect の依存を安定させる
  const autoLoadRef = useRef(autoLoad);
  autoLoadRef.current = autoLoad;
  // 自動 loadMore が進行中かどうかを示すフラグ (二重発火防止)
  const autoLoadingRef = useRef(false);

  const fetchInitial = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    autoLoadingRef.current = false;
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
        autoLoadCount: 0,
      });
    } catch (err) {
      if (reqId !== reqIdRef.current) return;
      setState({
        articles: [],
        nextCursor: null,
        loading: false,
        loadingMore: false,
        error: err instanceof Error ? err.message : String(err),
        autoLoadCount: 0,
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
        autoLoadCount: s.autoLoadCount,
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

  // フィルタが ON で表示件数が MIN_VISIBLE 未満かつ次ページがある間、自動で次ページを取得する。
  // autoLoadingRef で進行中フラグを管理し、state.loadingMore の変化による重複発火を防ぐ。
  // AUTO_LOAD_MAX で D1 free tier の reads 上限を意識した上限を設ける。
  useEffect(() => {
    const { isFilterActive, filteredLength } = autoLoadRef.current;
    if (!isFilterActive) return;
    if (filteredLength >= MIN_VISIBLE) return;
    if (!state.nextCursor) return;
    if (state.loading) return;
    if (autoLoadingRef.current) return;
    if (state.autoLoadCount >= AUTO_LOAD_MAX) return;

    autoLoadingRef.current = true;
    const cursor = state.nextCursor;
    const reqId = reqIdRef.current;

    setState((s) => ({ ...s, loadingMore: true, autoLoadCount: s.autoLoadCount + 1 }));

    void (async () => {
      try {
        const res = await fetch(buildUrl(query, cursor));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ArticlesResponse;
        if (reqId !== reqIdRef.current) return;
        setState((s) => ({
          ...s,
          articles: [...s.articles, ...data.articles],
          nextCursor: data.nextCursor,
          loadingMore: false,
        }));
      } catch (err) {
        if (reqId !== reqIdRef.current) return;
        setState((s) => ({
          ...s,
          loadingMore: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      } finally {
        autoLoadingRef.current = false;
      }
    })();
    // state.nextCursor と state.autoLoadCount の変化で次ページがあれば再発火する。
    // state.loadingMore は autoLoadingRef で代替するため依存から除外。
    // query の変化は fetchInitial 経由で state.nextCursor がリセットされるため追跡不要。
  }, [query, state.nextCursor, state.loading, state.autoLoadCount]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoLoadStopped =
    autoLoad.isFilterActive &&
    autoLoad.filteredLength < MIN_VISIBLE &&
    state.autoLoadCount >= AUTO_LOAD_MAX &&
    state.nextCursor !== null;

  return { ...state, loadMore, reload: fetchInitial, autoLoadStopped };
}
