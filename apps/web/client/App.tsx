import { useEffect, useMemo, useState } from "react";
import { ArticleList } from "./components/ArticleList";
import { FilterBar } from "./components/FilterBar";
import { SearchInput } from "./components/SearchInput";
import { useArticles } from "./hooks/useArticles";
import { useFeeds } from "./hooks/useFeeds";
import { useStats } from "./hooks/useStats";
import type { FeedCategory, FeedLang } from "./types/api";

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "今";
  if (min < 60) return `${min} 分前`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} 時間前`;
  const d = Math.round(h / 24);
  return `${d} 日前`;
}

function readFromUrl(): {
  category: FeedCategory | "";
  lang: FeedLang | "";
  feedId: string;
  q: string;
} {
  const params = new URLSearchParams(window.location.search);
  return {
    category: (params.get("category") as FeedCategory | null) ?? "",
    lang: (params.get("lang") as FeedLang | null) ?? "",
    feedId: params.get("feed_id") ?? "",
    q: params.get("q") ?? "",
  };
}

export default function App() {
  const [category, setCategory] = useState<FeedCategory | "">(() => readFromUrl().category);
  const [lang, setLang] = useState<FeedLang | "">(() => readFromUrl().lang);
  const [feedId, setFeedId] = useState<string>(() => readFromUrl().feedId);
  const [q, setQ] = useState<string>(() => readFromUrl().q);

  const { feeds } = useFeeds();
  const { stats } = useStats();

  useEffect(() => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (lang) params.set("lang", lang);
    if (feedId) params.set("feed_id", feedId);
    if (q) params.set("q", q);
    const search = params.toString();
    const next = search ? `?${search}` : window.location.pathname;
    window.history.replaceState(null, "", next);
  }, [category, lang, feedId, q]);

  const query = useMemo(
    () => ({
      category: category || undefined,
      lang: lang || undefined,
      feedId: feedId || undefined,
      q: q || undefined,
    }),
    [category, lang, feedId, q],
  );

  const { articles, loading, loadingMore, error, nextCursor, loadMore } = useArticles(query);

  return (
    <div className="app">
      <header className="header">
        <h1>Tech News Bot</h1>
        <span className="subtitle">
          {stats ? `${stats.total.toLocaleString()} 記事 · 直近 24h: ${stats.last24h}` : ""}
          {feeds.length > 0 ? ` · ${feeds.length} sources` : ""}
          {stats?.last_fetched_at ? ` · 最終更新 ${formatRelative(stats.last_fetched_at)}` : ""}
        </span>
        {stats && stats.stale_feeds.length > 0 && (
          <details className="stale-warning">
            <summary>⚠ {stats.stale_feeds.length} 件の収集に問題があります</summary>
            <ul>
              {stats.stale_feeds.map((f) => (
                <li key={f.id}>
                  <strong>{f.name}</strong>
                  {f.last_status === "error" ? " · error" : " · stale"}
                  {f.last_fetched_at ? ` · ${formatRelative(f.last_fetched_at)}` : " · 未取得"}
                  {f.last_error && <div className="stale-error">{f.last_error}</div>}
                </li>
              ))}
            </ul>
          </details>
        )}
      </header>

      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} />
        <FilterBar
          category={category}
          lang={lang}
          feedId={feedId}
          feeds={feeds}
          onCategoryChange={(v) => {
            setCategory(v);
            setFeedId("");
          }}
          onLangChange={(v) => {
            setLang(v);
            setFeedId("");
          }}
          onFeedChange={setFeedId}
        />
      </div>

      {loading && <div className="loader">読み込み中…</div>}
      {error && !loading && <div className="error">取得エラー: {error}</div>}
      {!loading && !error && articles.length === 0 && (
        <div className="empty">記事はまだありません。Cron 実行をお待ちください。</div>
      )}

      {articles.length > 0 && <ArticleList articles={articles} />}

      {nextCursor && (
        <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "読み込み中…" : "もっと読み込む"}
        </button>
      )}
    </div>
  );
}
