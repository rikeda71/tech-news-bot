import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import { useReport } from "../hooks/useReports";
import { formatDatetime } from "../lib/format-date";
import { safeHref } from "../utils/safe-href";

const KIND_LABELS: Record<string, string> = {
  daily: "日次",
  weekly: "週次",
  monthly: "月次",
};

interface MetaJson {
  dedup_total?: number;
  by_category?: Record<string, number>;
  by_feed?: Record<string, number>;
}

function parseMeta(metaJson: string | null): MetaJson | null {
  if (!metaJson) return null;
  try {
    return JSON.parse(metaJson) as MetaJson;
  } catch {
    return null;
  }
}

// markdown 内のリンクを新タブで開くカスタムレンダラ。
// javascript:/data: などの危険な URI を遮断するため safeHref を通す
const markdownComponents: Components = {
  a: ({ href, children, ...props }) => (
    <a href={safeHref(href)} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
};

interface Props {
  id: number;
  onBack: () => void;
}

export function ReportDetail({ id, onBack }: Props) {
  const { data: report, loading, error } = useReport(id);

  if (loading) {
    return (
      <div className="py-[var(--space-8)]">
        <p className="text-[var(--fg-muted)] text-[var(--font-size-sm)]">読み込み中...</p>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="py-[var(--space-8)]">
        <button
          type="button"
          className="text-[var(--accent)] text-[var(--font-size-sm)] border-none bg-transparent font-[inherit] cursor-pointer p-0 mb-[var(--space-4)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          onClick={onBack}
        >
          ← 一覧に戻る
        </button>
        <p className="text-[var(--fg-muted)] text-[var(--font-size-sm)]">
          {error ?? "レポートが見つかりません"}
        </p>
      </div>
    );
  }

  const meta = parseMeta(report.meta_json);

  return (
    <article>
      {/* 戻るリンク */}
      <button
        type="button"
        className="text-[var(--accent)] text-[var(--font-size-sm)] border-none bg-transparent font-[inherit] cursor-pointer p-0 mb-[var(--space-4)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
        onClick={onBack}
      >
        ← 一覧に戻る
      </button>

      {/* ヘッダ情報 */}
      <div className="p-[var(--space-4)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)] mb-[var(--space-6)]">
        <div className="flex flex-wrap items-center gap-[var(--space-2)] mb-[var(--space-2)]">
          <span className="inline-flex items-center px-[var(--space-2)] py-0.5 rounded-full text-[var(--font-size-xs)] font-semibold uppercase tracking-[0.04em] bg-[var(--accent-soft)] text-[var(--accent)]">
            {KIND_LABELS[report.kind] ?? report.kind}
          </span>
          {report.category && (
            <span className="text-[var(--fg-muted)] text-[var(--font-size-sm)]">
              {report.category}
            </span>
          )}
          {report.lang && (
            <span className="text-[var(--fg-muted)] text-[var(--font-size-sm)]">{report.lang}</span>
          )}
        </div>
        <p className="text-[var(--fg-primary)] font-semibold text-[var(--font-size-md)] m-0 mb-[var(--space-1)]">
          {new Date(report.period_start).toLocaleDateString("ja-JP")} 〜{" "}
          {new Date(report.period_end).toLocaleDateString("ja-JP")}
        </p>
        <p className="text-[var(--fg-muted)] text-[var(--font-size-xs)] m-0">
          生成: {formatDatetime(report.generated_at)} · {report.source_skill}
        </p>
      </div>

      {/* meta_json カード (dedup_total, by_category, by_feed) */}
      {meta && (
        <div className="flex flex-wrap gap-[var(--space-3)] mb-[var(--space-6)]">
          {meta.dedup_total !== undefined && (
            <div className="p-[var(--space-3)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] min-w-[120px]">
              <p className="text-[var(--fg-muted)] text-[var(--font-size-xs)] m-0 mb-[2px]">
                収集記事 (dedup)
              </p>
              <p className="text-[var(--fg-primary)] font-bold text-[var(--font-size-lg)] m-0">
                {meta.dedup_total}
              </p>
            </div>
          )}
          {meta.by_category && (
            <div className="p-[var(--space-3)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-md)]">
              <p className="text-[var(--fg-muted)] text-[var(--font-size-xs)] m-0 mb-[var(--space-1)]">
                カテゴリ別
              </p>
              <div className="flex flex-wrap gap-[var(--space-2)]">
                {Object.entries(meta.by_category).map(([cat, count]) => (
                  <span key={cat} className="text-[var(--font-size-xs)] text-[var(--fg-secondary)]">
                    {cat}: <strong className="text-[var(--fg-primary)]">{count}</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* markdown 本文 */}
      <div className="prose prose-[var(--fg-primary)] max-w-none [&_h1]:text-[var(--font-size-xl)] [&_h1]:font-bold [&_h1]:mb-[var(--space-3)] [&_h1]:text-[var(--fg-primary)] [&_h2]:text-[var(--font-size-lg)] [&_h2]:font-semibold [&_h2]:mb-[var(--space-2)] [&_h2]:mt-[var(--space-6)] [&_h2]:text-[var(--fg-primary)] [&_h3]:text-[var(--font-size-md)] [&_h3]:font-semibold [&_h3]:mb-[var(--space-2)] [&_h3]:mt-[var(--space-4)] [&_h3]:text-[var(--fg-primary)] [&_p]:text-[var(--fg-secondary)] [&_p]:leading-[var(--line-height-relaxed)] [&_p]:mb-[var(--space-3)] [&_a]:text-[var(--accent)] [&_a]:underline [&_ul]:pl-[var(--space-4)] [&_ul]:mb-[var(--space-3)] [&_ol]:pl-[var(--space-4)] [&_ol]:mb-[var(--space-3)] [&_li]:text-[var(--fg-secondary)] [&_li]:mb-[var(--space-1)] [&_code]:bg-[var(--bg-elevated)] [&_code]:px-[var(--space-1)] [&_code]:py-[2px] [&_code]:rounded-[var(--radius-sm)] [&_code]:text-[var(--font-size-sm)] [&_pre]:bg-[var(--bg-elevated)] [&_pre]:p-[var(--space-4)] [&_pre]:rounded-[var(--radius-md)] [&_pre]:overflow-x-auto [&_pre]:mb-[var(--space-3)] [&_blockquote]:border-l-4 [&_blockquote]:border-[var(--border-subtle)] [&_blockquote]:pl-[var(--space-3)] [&_blockquote]:text-[var(--fg-muted)] [&_hr]:border-[var(--border-subtle)] [&_hr]:my-[var(--space-6)] [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_th]:border-[var(--border-subtle)] [&_th]:px-[var(--space-3)] [&_th]:py-[var(--space-2)] [&_th]:bg-[var(--bg-elevated)] [&_th]:text-[var(--fg-primary)] [&_td]:border [&_td]:border-[var(--border-subtle)] [&_td]:px-[var(--space-3)] [&_td]:py-[var(--space-2)] [&_td]:text-[var(--fg-secondary)]">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
          {report.content}
        </ReactMarkdown>
      </div>
    </article>
  );
}
