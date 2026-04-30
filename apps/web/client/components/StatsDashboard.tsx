import { useEffect, useState } from "react";
import { CalendarHeatmap } from "./CalendarHeatmap";
import type { AuthorCount, PublisherCount, Stats } from "../hooks/useStats";

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-[var(--space-4)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] flex flex-col gap-[var(--space-1)] transition-[box-shadow] duration-200 hover:shadow-[var(--shadow-sm)]">
      <div className="text-[var(--font-size-xs)] font-semibold text-[var(--fg-muted)] uppercase tracking-[0.06em]">
        {label}
      </div>
      <div className="text-[var(--font-size-2xl)] font-bold text-[var(--fg-primary)] leading-[1.1] tracking-[-0.02em]">
        {value.toLocaleString("ja-JP")}
      </div>
    </div>
  );
}

// stats セクション共通スタイル
const sectionClass =
  "p-[var(--space-4)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)]";
const sectionTitleClass =
  "text-[var(--font-size-sm)] font-semibold text-[var(--fg-muted)] m-0 mb-[var(--space-4)] uppercase tracking-[0.05em]";

function BarRow({
  label,
  count,
  maxCount,
  onClick,
}: {
  label: string;
  count: number;
  maxCount: number;
  onClick?: () => void;
}) {
  const pct = maxCount > 0 ? Math.round((count / maxCount) * 100) : 0;
  return (
    <div className="grid [grid-template-columns:minmax(120px,180px)_1fr_56px] items-center gap-[var(--space-3)]">
      {onClick ? (
        <button
          type="button"
          className="text-[var(--font-size-sm)] text-[var(--fg-primary)] whitespace-nowrap overflow-hidden text-ellipsis bg-transparent border-none cursor-pointer p-0 font-[inherit] text-left transition-[color] duration-100 hover:text-[var(--accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 focus-visible:rounded-[var(--radius-sm)]"
          onClick={onClick}
          title={`${label} の記事一覧`}
        >
          {label}
        </button>
      ) : (
        <span className="text-[var(--font-size-sm)] text-[var(--fg-primary)] whitespace-nowrap overflow-hidden text-ellipsis">
          {label}
        </span>
      )}
      <div
        className="relative h-[12px] rounded-[var(--radius-full)] bg-[var(--bg-overlay)] overflow-hidden"
        role="img"
        aria-label={`${label}: ${count}件`}
      >
        <div
          className="h-full rounded-[var(--radius-full)] bg-[var(--accent)] min-w-[2px] transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[var(--font-size-sm)] font-semibold text-[var(--fg-primary)] text-right [font-variant-numeric:tabular-nums]">
        {count.toLocaleString("ja-JP")}
      </span>
    </div>
  );
}

function AuthorsSection({
  authors,
  onAuthorClick,
}: {
  authors: AuthorCount[];
  onAuthorClick?: (author: string) => void;
}) {
  const top = authors.slice(0, 10);
  const max = top[0]?.count ?? 1;
  return (
    <section className={sectionClass}>
      <h3 className={sectionTitleClass}>著者別 (30 日・上位 10 件)</h3>
      <div className="grid gap-[var(--space-2)]">
        {top.map((a) => (
          <BarRow
            key={a.author}
            label={a.author}
            count={a.count}
            maxCount={max}
            onClick={onAuthorClick ? () => onAuthorClick(a.author) : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function PublishersSection({ publishers }: { publishers: PublisherCount[] }) {
  const top = publishers.slice(0, 10);
  const max = top[0]?.count ?? 1;
  return (
    <section className={sectionClass}>
      <h3 className={sectionTitleClass}>フィード別 (30 日・上位 10 件)</h3>
      <div className="grid gap-[var(--space-2)]">
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
    <section className={sectionClass}>
      <h3 className={sectionTitleClass}>言語別 (30 日)</h3>
      <div className="grid gap-[var(--space-2)]">
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
    <section className={sectionClass}>
      <h3 className={sectionTitleClass}>カテゴリ別 (累計)</h3>
      <div className="grid gap-[var(--space-2)]">
        {entries.map(([cat, count]) => (
          <BarRow key={cat} label={cat} count={count} maxCount={max} />
        ))}
      </div>
    </section>
  );
}

interface StatsDashboardProps {
  onNavigateToAuthor?: (author: string) => void;
}

export function StatsDashboard({ onNavigateToAuthor }: StatsDashboardProps = {}) {
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

  if (loading)
    return (
      <div className="text-center text-[var(--fg-muted)] p-[var(--space-8)_var(--space-3)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-lg)] mt-[var(--space-4)] text-[var(--font-size-base)] leading-[var(--line-height-relaxed)]">
        読み込み中…
      </div>
    );
  if (error)
    return (
      <div className="text-center text-[var(--danger)] p-[var(--space-8)_var(--space-3)] border border-[rgba(207,34,46,0.3)] rounded-[var(--radius-lg)] mt-[var(--space-4)] bg-[var(--danger-soft)] text-[var(--font-size-base)] leading-[var(--line-height-relaxed)]">
        エラー: {error}
      </div>
    );
  if (!stats) return null;

  // PR #148 で追加されたフィールドにフォールバック
  const articles24h = stats.articles_24h ?? stats.last24h;
  const articles7d = stats.articles_7d ?? 0;
  const articles30d = stats.articles_30d ?? 0;
  const totalArticles = stats.total;

  return (
    <div className="grid gap-[var(--space-6)] py-[var(--space-2)]">
      {/* サマリカード */}
      <div className="grid [grid-template-columns:repeat(2,1fr)] gap-[var(--space-3)] sm:[grid-template-columns:repeat(4,1fr)]">
        <SummaryCard label="総記事数" value={totalArticles} />
        <SummaryCard label="直近 24h" value={articles24h} />
        <SummaryCard label="直近 7 日" value={articles7d} />
        <SummaryCard label="直近 30 日" value={articles30d} />
      </div>

      <CalendarHeatmap days={90} />

      {stats.top_authors_30d && stats.top_authors_30d.length > 0 && (
        <AuthorsSection authors={stats.top_authors_30d} onAuthorClick={onNavigateToAuthor} />
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
