import type { FeedActivity, Stats, TrendPoint } from "../hooks/useStats";
import { StatsChart } from "./StatsChart";

interface StatsProps {
  stats: Stats;
}

const TREND_CATEGORIES: Array<keyof Omit<TrendPoint, "date">> = ["bigtech", "ai", "jp", "zenn"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FeedActivityTable({ rows }: { rows: FeedActivity[] }) {
  if (rows.length === 0)
    return (
      <p className="text-[var(--fg-muted)] text-[var(--font-size-sm)] m-0">過去 30 日に記事なし</p>
    );
  return (
    <table className="w-full border-collapse text-[var(--font-size-sm)]">
      <thead>
        <tr>
          <th className="py-[var(--space-2)] px-[var(--space-2)] text-left border-b border-[var(--border-subtle)] text-[var(--fg-muted)] font-semibold text-[var(--font-size-xs)] uppercase tracking-[0.05em]">
            フィード
          </th>
          <th className="py-[var(--space-2)] px-[var(--space-2)] text-right border-b border-[var(--border-subtle)] text-[var(--fg-muted)] font-semibold text-[var(--font-size-xs)] uppercase tracking-[0.05em] w-[60px]">
            30 日
          </th>
          <th className="py-[var(--space-2)] px-[var(--space-2)] text-left border-b border-[var(--border-subtle)] text-[var(--fg-muted)] font-semibold text-[var(--font-size-xs)] uppercase tracking-[0.05em] whitespace-nowrap w-[160px]">
            最終記事
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.feed_id}>
            <td className="py-[var(--space-2)] px-[var(--space-2)] text-left border-b border-[var(--border-subtle)] text-[var(--fg-primary)]">
              {row.feed_name}
            </td>
            <td className="py-[var(--space-2)] px-[var(--space-2)] text-right border-b border-[var(--border-subtle)] text-[var(--fg-primary)] w-[60px]">
              {row.articles_30d}
            </td>
            <td className="py-[var(--space-2)] px-[var(--space-2)] text-left border-b border-[var(--border-subtle)] text-[var(--fg-muted)] whitespace-nowrap w-[160px]">
              {row.last_published_at ? formatDate(row.last_published_at) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StatsPanel({ stats }: StatsProps) {
  const hasTrend =
    stats.category_trend_30d.length > 0 &&
    stats.category_trend_30d.some((p) => TREND_CATEGORIES.some((c) => p[c] > 0));

  return (
    <section className="mb-[var(--space-6)] p-[var(--space-4)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)]">
      <h2 className="text-[var(--font-size-sm)] font-semibold text-[var(--fg-muted)] m-0 mb-[var(--space-3)] uppercase tracking-[0.05em]">
        カテゴリ別 30 日トレンド
      </h2>
      {hasTrend ? (
        <StatsChart data={stats.category_trend_30d} categories={TREND_CATEGORIES} />
      ) : (
        <p className="text-[var(--fg-muted)] text-[var(--font-size-sm)] m-0">
          過去 30 日のデータがありません
        </p>
      )}

      <h2 className="text-[var(--font-size-sm)] font-semibold text-[var(--fg-muted)] m-0 mb-[var(--space-3)] mt-[24px] uppercase tracking-[0.05em]">
        フィード別アクティビティ (30 日)
      </h2>
      <FeedActivityTable rows={stats.feed_activity} />
    </section>
  );
}
