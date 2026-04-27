import { useCallback, useEffect, useMemo, useState } from "react";
import { ArticleList } from "./components/ArticleList";
import { FilterBar } from "./components/FilterBar";
import { SearchInput } from "./components/SearchInput";
import { ThemeToggle } from "./components/ThemeToggle";
import { useArticles } from "./hooks/useArticles";
import { useFeeds } from "./hooks/useFeeds";
import { useStats } from "./hooks/useStats";
import { useTheme } from "./hooks/useTheme";
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
  dateFrom: string;
  dateTo: string;
} {
  const params = new URLSearchParams(window.location.search);
  return {
    category: (params.get("category") as FeedCategory | null) ?? "",
    lang: (params.get("lang") as FeedLang | null) ?? "",
    feedId: params.get("feed_id") ?? "",
    q: params.get("q") ?? "",
    dateFrom: params.get("date_from") ?? "",
    dateTo: params.get("date_to") ?? "",
  };
}

function buildSearch(
  category: FeedCategory | "",
  lang: FeedLang | "",
  feedId: string,
  q: string,
  dateFrom: string,
  dateTo: string,
): string {
  const params = new URLSearchParams();
  if (category) params.set("category", category);
  if (lang) params.set("lang", lang);
  if (feedId) params.set("feed_id", feedId);
  if (q) params.set("q", q);
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const s = params.toString();
  return s ? `?${s}` : window.location.pathname;
}

export default function App() {
  const [category, setCategory] = useState<FeedCategory | "">(() => readFromUrl().category);
  const [lang, setLang] = useState<FeedLang | "">(() => readFromUrl().lang);
  const [feedId, setFeedId] = useState<string>(() => readFromUrl().feedId);
  const [q, setQ] = useState<string>(() => readFromUrl().q);
  const [dateFrom, setDateFrom] = useState<string>(() => readFromUrl().dateFrom);
  const [dateTo, setDateTo] = useState<string>(() => readFromUrl().dateTo);

  const { theme, toggleTheme } = useTheme();
  const { feeds } = useFeeds();
  const { stats } = useStats();

  // popstate でブラウザ戻る/進むに追従する
  useEffect(() => {
    const onPop = () => {
      const next = readFromUrl();
      setCategory(next.category);
      setLang(next.lang);
      setFeedId(next.feedId);
      setQ(next.q);
      setDateFrom(next.dateFrom);
      setDateTo(next.dateTo);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // フィルタ変更時は pushState で履歴に積む
  const pushFilter = useCallback(
    (
      nextCategory: FeedCategory | "",
      nextLang: FeedLang | "",
      nextFeedId: string,
      nextQ: string,
      nextDateFrom: string,
      nextDateTo: string,
    ) => {
      const next = buildSearch(nextCategory, nextLang, nextFeedId, nextQ, nextDateFrom, nextDateTo);
      const current = buildSearch(category, lang, feedId, q, dateFrom, dateTo);
      // 同じ URL なら重複履歴を作らない
      if (next !== current) {
        window.history.pushState(null, "", next);
      }
      setCategory(nextCategory);
      setLang(nextLang);
      setFeedId(nextFeedId);
      setQ(nextQ);
      setDateFrom(nextDateFrom);
      setDateTo(nextDateTo);
    },
    [category, lang, feedId, q, dateFrom, dateTo],
  );

  const handleCategoryChange = useCallback(
    (v: FeedCategory | "") => pushFilter(v, lang, v ? feedId : "", q, dateFrom, dateTo),
    [pushFilter, lang, feedId, q, dateFrom, dateTo],
  );

  const handleLangChange = useCallback(
    (v: FeedLang | "") => pushFilter(category, v, v ? feedId : "", q, dateFrom, dateTo),
    [pushFilter, category, feedId, q, dateFrom, dateTo],
  );

  const handleFeedChange = useCallback(
    (id: string) => pushFilter(category, lang, id, q, dateFrom, dateTo),
    [pushFilter, category, lang, q, dateFrom, dateTo],
  );

  const handleQChange = useCallback(
    (v: string) => pushFilter(category, lang, feedId, v, dateFrom, dateTo),
    [pushFilter, category, lang, feedId, dateFrom, dateTo],
  );

  const handleDateFromChange = useCallback(
    (v: string) => pushFilter(category, lang, feedId, q, v, dateTo),
    [pushFilter, category, lang, feedId, q, dateTo],
  );

  const handleDateToChange = useCallback(
    (v: string) => pushFilter(category, lang, feedId, q, dateFrom, v),
    [pushFilter, category, lang, feedId, q, dateFrom],
  );

  const handleClear = useCallback(() => pushFilter("", "", "", q, "", ""), [pushFilter, q]);

  // カード上のバッジ/取得元クリックでフィルタを適用する
  const handleFilterByCategory = useCallback(
    (c: FeedCategory) => pushFilter(c, lang, "", q, dateFrom, dateTo),
    [pushFilter, lang, q, dateFrom, dateTo],
  );

  const handleFilterByFeedId = useCallback(
    (id: string) => pushFilter(category, lang, id, q, dateFrom, dateTo),
    [pushFilter, category, lang, q, dateFrom, dateTo],
  );

  const query = useMemo(
    () => ({
      category: category || undefined,
      lang: lang || undefined,
      feedId: feedId || undefined,
      q: q || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    }),
    [category, lang, feedId, q, dateFrom, dateTo],
  );

  const { articles, loading, loadingMore, error, nextCursor, loadMore } = useArticles(query);

  return (
    <div className="app">
      <header className="header">
        <h1>Tech News Bot</h1>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
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
        <SearchInput value={q} onChange={handleQChange} />
        <FilterBar
          category={category}
          lang={lang}
          feedId={feedId}
          feeds={feeds}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onCategoryChange={handleCategoryChange}
          onLangChange={handleLangChange}
          onFeedChange={handleFeedChange}
          onDateFromChange={handleDateFromChange}
          onDateToChange={handleDateToChange}
          onClear={handleClear}
        />
      </div>

      {loading && <div className="loader">読み込み中…</div>}
      {error && !loading && <div className="error">取得エラー: {error}</div>}
      {!loading && !error && articles.length === 0 && (
        <div className="empty">記事はまだありません。Cron 実行をお待ちください。</div>
      )}

      {articles.length > 0 && (
        <ArticleList
          articles={articles}
          onFilterByCategory={handleFilterByCategory}
          onFilterByFeedId={handleFilterByFeedId}
        />
      )}

      {nextCursor && (
        <button type="button" className="load-more" onClick={loadMore} disabled={loadingMore}>
          {loadingMore ? "読み込み中…" : "もっと読み込む"}
        </button>
      )}
    </div>
  );
}
