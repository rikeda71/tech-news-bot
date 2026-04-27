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
  if (rows.length === 0) return <p className="stats-empty">過去 30 日に記事なし</p>;
  return (
    <table className="stats-feed-table">
      <thead>
        <tr>
          <th>フィード</th>
          <th className="stats-feed-table-num">30 日</th>
          <th className="stats-feed-table-date">最終記事</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.feed_id}>
            <td>{row.feed_name}</td>
            <td className="stats-feed-table-num">{row.articles_30d}</td>
            <td className="stats-feed-table-date">
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
    <section className="stats-panel">
      <h2 className="stats-panel-title">カテゴリ別 30 日トレンド</h2>
      {hasTrend ? (
        <StatsChart data={stats.category_trend_30d} categories={TREND_CATEGORIES} />
      ) : (
        <p className="stats-empty">過去 30 日のデータがありません</p>
      )}

      <h2 className="stats-panel-title" style={{ marginTop: "24px" }}>
        フィード別アクティビティ (30 日)
      </h2>
      <FeedActivityTable rows={stats.feed_activity} />
    </section>
  );
}
