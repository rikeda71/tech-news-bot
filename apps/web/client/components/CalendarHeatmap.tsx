import { useState } from "react";
import { useArticlesCalendar } from "../hooks/useArticlesCalendar";

type Period = 30 | 90 | 365;

const PERIODS: Period[] = [30, 90, 365];

// count 値からヒートマップレベル (0〜4) を算出する
function countToLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

// YYYY-MM-DD 文字列を UTC 日付として Date オブジェクトに変換する
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// "YYYY-MM-DD" を "M月D日" 形式に変換する
function formatDateLabel(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${m}月${d}日`;
}

const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// ヒートマップレベル → CSS 変数を任意プロパティ式で参照するマップ
const LEVEL_BG_CLASSES: Record<number, string> = {
  0: "bg-[var(--heatmap-l0)]",
  1: "bg-[var(--heatmap-l1)]",
  2: "bg-[var(--heatmap-l2)]",
  3: "bg-[var(--heatmap-l3)]",
  4: "bg-[var(--heatmap-l4)]",
};

interface Props {
  days?: Period;
}

export function CalendarHeatmap({ days: initialDays = 90 }: Props) {
  const [period, setPeriod] = useState<Period>(initialDays);
  const { items, isLoading, error } = useArticlesCalendar(period);

  if (error) {
    return (
      <section className="p-[var(--space-4)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)]">
        <h2 className="text-[var(--font-size-sm)] font-semibold text-[var(--fg-muted)] m-0 mb-[var(--space-4)] uppercase tracking-[0.05em]">
          活動カレンダー
        </h2>
        <p className="text-center text-[var(--danger)] p-[var(--space-8)_var(--space-3)] border border-[rgba(207,34,46,0.3)] rounded-[var(--radius-lg)] bg-[var(--danger-soft)] text-[var(--font-size-base)] leading-[var(--line-height-relaxed)] mt-0">
          ヒートマップを取得できませんでした
        </p>
      </section>
    );
  }

  // date→count のマップを構築する
  const countMap = new Map<string, number>(items.map((d) => [d.date, d.count]));

  // 表示範囲: 今日から period 日前まで (UTC 基準)
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setUTCDate(today.getUTCDate() - (period - 1));

  // グリッドは日曜始まりの週単位。開始週の日曜まで遡る
  const startDow = startDate.getUTCDay(); // 0=日
  const gridStart = new Date(startDate);
  gridStart.setUTCDate(startDate.getUTCDate() - startDow);

  // セルを生成する。日数でループすることで oxlint の no-unmodified-loop-condition を回避する
  const totalDays = Math.round((today.getTime() - gridStart.getTime()) / 86_400_000) + 1;
  const cells: Array<{ dateStr: string | null; count: number; inRange: boolean }> = [];
  for (let offset = 0; offset < totalDays; offset++) {
    const cur = new Date(gridStart);
    cur.setUTCDate(gridStart.getUTCDate() + offset);
    const dateStr = cur.toISOString().slice(0, 10);
    const inRange = cur >= startDate && cur <= today;
    cells.push({
      dateStr: inRange ? dateStr : null,
      count: inRange ? (countMap.get(dateStr) ?? 0) : 0,
      inRange,
    });
  }

  // 末尾を土曜まで埋める
  const lastDow = today.getUTCDay();
  if (lastDow < 6) {
    for (let i = lastDow + 1; i <= 6; i++) {
      cells.push({ dateStr: null, count: 0, inRange: false });
    }
  }

  const totalWeeks = Math.ceil(cells.length / 7);

  // 月ラベル: 各週の最初の日が月初 (1日) なら表示する
  const monthLabels: Array<{ weekIndex: number; label: string }> = [];
  for (let w = 0; w < totalWeeks; w++) {
    const cellIndex = w * 7;
    const cell = cells[cellIndex];
    if (!cell?.inRange || !cell.dateStr) continue;
    const date = parseDate(cell.dateStr);
    // 月の最初の週のみラベルを付ける (日付が 1〜7 の範囲なら月初周辺)
    if (date.getUTCDate() <= 7) {
      const month = date.getUTCMonth() + 1;
      monthLabels.push({ weekIndex: w, label: `${month}月` });
    }
  }

  return (
    <section className="p-[var(--space-4)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-lg)]">
      <div className="flex items-center justify-between flex-wrap gap-[var(--space-2)] mb-[var(--space-3)]">
        <h2 className="text-[var(--font-size-sm)] font-semibold text-[var(--fg-muted)] m-0 uppercase tracking-[0.05em]">
          活動カレンダー
        </h2>
        <div
          className="flex gap-[var(--space-1)] border border-[var(--border-subtle)] rounded-[var(--radius-full)] p-[3px] bg-[var(--bg-overlay)]"
          role="group"
          aria-label="表示期間"
        >
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              className={`px-[var(--space-3)] py-[3px] border-none rounded-[var(--radius-full)] text-[var(--font-size-sm)] font-[inherit] cursor-pointer transition-[background,color] duration-100 focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2${
                period === p
                  ? " bg-[var(--bg-elevated)] text-[var(--accent)] font-semibold shadow-[var(--shadow-sm)]"
                  : " bg-transparent text-[var(--fg-muted)] hover:text-[var(--fg-primary)]"
              }`}
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
            >
              {p}日
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center text-[var(--fg-muted)] p-[var(--space-4)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-lg)] text-[var(--font-size-base)]">
          読み込み中…
        </div>
      ) : (
        <div className="overflow-x-auto pb-[var(--space-1)]">
          {/* 月ラベル行 */}
          <div
            className="grid gap-[3px] ml-[28px] mb-[var(--space-1)]"
            style={{ gridTemplateColumns: `repeat(${totalWeeks}, 1fr)` }}
          >
            {Array.from({ length: totalWeeks }, (_, w) => {
              const label = monthLabels.find((m) => m.weekIndex === w);
              return (
                <div key={w} className="text-[0.7rem] text-[var(--fg-muted)] whitespace-nowrap">
                  {label?.label ?? ""}
                </div>
              );
            })}
          </div>

          <div className="flex gap-[var(--space-1)] items-start">
            {/* 曜日ラベル列 */}
            <div className="grid [grid-template-rows:repeat(7,14px)] gap-[3px] shrink-0 w-[24px]">
              {DAY_LABELS.map((label, i) => (
                <div
                  key={i}
                  className="text-[0.65rem] text-[var(--fg-muted)] leading-[14px] text-right"
                >
                  {label}
                </div>
              ))}
            </div>

            {/* ヒートマップグリッド: 縦 7 行 (曜日) × 横 N 週 */}
            <div
              className="grid [grid-template-rows:repeat(7,14px)] [grid-auto-flow:column] gap-[3px] shrink-0"
              style={{ gridTemplateColumns: `repeat(${totalWeeks}, 1fr)` }}
            >
              {cells.map((cell, idx) => {
                const level = cell.inRange ? countToLevel(cell.count) : -1;
                const label = cell.dateStr
                  ? `${formatDateLabel(cell.dateStr)}: ${cell.count}件`
                  : "";
                // inRange でないセルは invisible にする
                const bgClass = level >= 0 ? (LEVEL_BG_CLASSES[level] ?? "") : "";
                return (
                  <div
                    key={idx}
                    className={`w-[14px] h-[14px] rounded-[3px] ring-1 ring-inset ring-[var(--border-subtle)]/40 transition-transform duration-100 hover:scale-125 hover:ring-[var(--accent)]${
                      level >= 0 ? ` ${bgClass}` : " invisible"
                    }`}
                    data-level={level}
                    aria-label={label || undefined}
                    title={label || undefined}
                    aria-hidden={!cell.inRange}
                  />
                );
              })}
            </div>
          </div>

          {/* 凡例 */}
          <div className="flex items-center gap-[var(--space-1)] mt-[var(--space-3)] justify-end text-[var(--font-size-xs)] text-[var(--fg-muted)]">
            <span>記事数</span>
            <span className="ml-[var(--space-1)]">少</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <div
                key={level}
                className={`w-[14px] h-[14px] rounded-[3px] ring-1 ring-inset ring-[var(--border-subtle)]/40 ${LEVEL_BG_CLASSES[level] ?? ""}`}
                aria-hidden
              />
            ))}
            <span>多</span>
          </div>
        </div>
      )}
    </section>
  );
}
