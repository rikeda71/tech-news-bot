import { useState } from "react";
import { formatDatetime } from "../lib/format-date";
import type { ReportKind } from "../types/api";
import { useReportsList } from "../hooks/useReports";

const KIND_LABELS: Record<ReportKind, string> = {
  daily: "日次",
  weekly: "週次",
  monthly: "月次",
};

type KindFilter = ReportKind | undefined;

interface Props {
  onSelectReport: (id: number) => void;
}

export function ReportsList({ onSelectReport }: Props) {
  const [kindFilter, setKindFilter] = useState<KindFilter>(undefined);
  const { data: reports, loading, error } = useReportsList(kindFilter);

  const chips: Array<{ label: string; value: KindFilter }> = [
    { label: "すべて", value: undefined },
    { label: "日次", value: "daily" },
    { label: "週次", value: "weekly" },
    { label: "月次", value: "monthly" },
  ];

  return (
    <section>
      <h2 className="text-[var(--font-size-lg)] font-bold mb-[var(--space-4)] text-[var(--fg-primary)]">
        レポート一覧
      </h2>

      {/* kind フィルタ chip */}
      <div
        role="group"
        aria-label="レポートの種別フィルタ"
        className="flex flex-wrap gap-[var(--space-2)] mb-[var(--space-4)]"
      >
        {chips.map(({ label, value }) => (
          <button
            key={label}
            type="button"
            aria-pressed={kindFilter === value}
            className={`inline-flex items-center px-[var(--space-3)] py-[5px] rounded-full text-[var(--font-size-sm)] font-medium border-none font-[inherit] cursor-pointer whitespace-nowrap transition-[background,color] duration-100 focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2${
              kindFilter === value
                ? " bg-[var(--accent-soft)] text-[var(--accent)] font-semibold"
                : " bg-[var(--bg-elevated)] text-[var(--fg-muted)] hover:bg-[var(--bg-overlay)] hover:text-[var(--fg-primary)]"
            }`}
            onClick={() => setKindFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <p
          role="status"
          aria-live="polite"
          className="text-[var(--fg-muted)] text-[var(--font-size-sm)]"
        >
          読み込み中...
        </p>
      )}

      {error && (
        <p role="alert" className="text-[var(--fg-muted)] text-[var(--font-size-sm)]">
          エラー: {error}
        </p>
      )}

      {!loading && !error && reports.length === 0 && (
        <p className="text-[var(--fg-muted)] text-[var(--font-size-sm)]">
          レポートがまだありません
        </p>
      )}

      {!loading && !error && reports.length > 0 && (
        <ul className="list-none m-0 p-0 flex flex-col gap-[var(--space-3)]">
          {reports.map((report) => (
            <li key={report.id}>
              <button
                type="button"
                className="w-full text-left p-[var(--space-4)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] transition-[border-color,box-shadow,transform] duration-200 hover:border-[var(--accent)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 cursor-pointer font-[inherit] focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
                onClick={() => onSelectReport(report.id)}
              >
                <div className="flex items-center gap-[var(--space-2)] mb-[var(--space-1)]">
                  <span className="inline-flex items-center px-[var(--space-2)] py-0.5 rounded-full text-[var(--font-size-xs)] font-semibold uppercase tracking-[0.04em] bg-[var(--accent-soft)] text-[var(--accent)]">
                    {KIND_LABELS[report.kind] ?? report.kind}
                  </span>
                  {report.category && (
                    <span className="text-[var(--fg-muted)] text-[var(--font-size-xs)]">
                      {report.category}
                    </span>
                  )}
                </div>
                <p className="text-[var(--fg-primary)] font-medium text-[var(--font-size-md)] m-0 mb-[var(--space-1)]">
                  {new Date(report.period_start).toLocaleDateString("ja-JP")} 〜{" "}
                  {new Date(report.period_end).toLocaleDateString("ja-JP")}
                </p>
                <p className="text-[var(--fg-muted)] text-[var(--font-size-xs)] m-0">
                  生成: {formatDatetime(report.generated_at)} · {report.source_skill}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
