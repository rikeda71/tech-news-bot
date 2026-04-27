import { useEffect, useState } from "react";
import type { AuthorCount, PublisherCount, Stats } from "../hooks/useStats";

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="stats-card">
      <div className="stats-card-label">{label}</div>
      <div className="stats-card-value">{value.toLocaleString("ja-JP")}</div>
    </div>
  );
}

function BarRow({ label, count, maxCount }: { label: string; count: number; maxCount: number }) {
  const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
  return (
    <div className="stats-bar-row">
      <span className="stats-bar-label">{label}</span>
      <div
        className="stats-bar"
        role="img"
        aria-label={`${label}: ${count}件`}
        style={{ width: `${pct}%` }}
      />
      <span className="stats-bar-count">{count.toLocaleString("ja-JP")}</span>
    </div>
  );
}

function AuthorsSection({ authors }: { authors: AuthorCount[] }) {
  const top = authors.slice(0, 10);
  const max = top[0]?.count ?? 1;
  return (
    <section className="stats-section">
      <h3 className="stats-section-title">著者別 (30 日・上位 10 件)</h3>
      <div className="stats-bar-list">
        {top.map((a) => (
          <BarRow key={a.author} label={a.author} count={a.count} maxCount={max} />
        ))}
      </div>
    </section>
  );
}

function PublishersSection({ publishers }: { publishers: PublisherCount[] }) {
  const top = publishers.slice(0, 10);
  const max = top[0]?.count ?? 1;
  return (
    <section className="stats-section">
      <h3 className="stats-section-title">フィード別 (30 日・上位 10 件)</h3>
      <div className="stats-bar-list">
        {top.map((p) => (
          <BarRow key={p.feed_id} label={p.name} count={p.count} maxCount={max} />
        ))}
      </div>
    </section>
  );
}

function LangSection({ byLang }: { byLang: Record<string, number> }) {
  const entries = Object.entries(byLang).toSorted((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 1;
  return (
    <section className="stats-section">
      <h3 className="stats-section-title">言語別 (30 日)</h3>
      <div className="stats-bar-list">
        {entries.map(([lang, count]) => (
          <BarRow key={lang} label={lang} count={count} maxCount={max} />
        ))}
      </div>
    </section>
  );
}

function CategorySection({ byCategory }: { byCategory: Record<string, number> }) {
  const entries = Object.entries(byCategory).toSorted((a, b) => b[1] - a[1]);
  const max = entries[0]?.[1] ?? 1;
  return (
    <section className="stats-section">
      <h3 className="stats-section-title">カテゴリ別 (累計)</h3>
      <div className="stats-bar-list">
        {entries.map(([cat, count]) => (
          <BarRow key={cat} label={cat} count={count} maxCount={max} />
        ))}
      </div>
    </section>
  );
}

export function StatsDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const res = await fetch("/api/stats");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Stats;
        if (alive) {
          setStats(data);
          setLoading(false);
        }
      } catch (err) {
        if (alive) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <div className="loader">読み込み中…</div>;
  if (error) return <div className="error">エラー: {error}</div>;
  if (!stats) return null;

  // PR #148 で追加されたフィールドにフォールバック
  const articles24h = stats.articles_24h ?? stats.last24h;
  const articles7d = stats.articles_7d ?? 0;
  const articles30d = stats.articles_30d ?? 0;
  const totalArticles = stats.total;

  return (
    <div className="stats-dashboard">
      {/* サマリカード */}
      <div className="stats-cards">
        <SummaryCard label="総記事数" value={totalArticles} />
        <SummaryCard label="直近 24h" value={articles24h} />
        <SummaryCard label="直近 7 日" value={articles7d} />
        <SummaryCard label="直近 30 日" value={articles30d} />
      </div>

      {stats.top_authors_30d && stats.top_authors_30d.length > 0 && (
        <AuthorsSection authors={stats.top_authors_30d} />
      )}

      {stats.top_publishers_30d && stats.top_publishers_30d.length > 0 && (
        <PublishersSection publishers={stats.top_publishers_30d} />
      )}

      {stats.by_lang_30d && Object.keys(stats.by_lang_30d).length > 0 && (
        <LangSection byLang={stats.by_lang_30d} />
      )}

      {stats.by_category && Object.keys(stats.by_category).length > 0 && (
        <CategorySection byCategory={stats.by_category} />
      )}
    </div>
  );
}
