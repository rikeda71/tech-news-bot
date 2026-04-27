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

interface Props {
  days?: Period;
}

export function CalendarHeatmap({ days: initialDays = 90 }: Props) {
  const [period, setPeriod] = useState<Period>(initialDays);
  const { items, isLoading, error } = useArticlesCalendar(period);

  if (error) {
    return (
      <section className="stats-section">
        <h2 className="stats-section-title">活動カレンダー</h2>
        <p className="error calendar-heatmap-error">ヒートマップを取得できませんでした</p>
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
    <section className="stats-section">
      <div className="calendar-heatmap-header">
        <h2 className="stats-section-title">活動カレンダー</h2>
        <div className="calendar-heatmap-period-toggle" role="group" aria-label="表示期間">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              className={`calendar-heatmap-period-btn${period === p ? " active" : ""}`}
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
            >
              {p}日
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="loader calendar-heatmap-loader">読み込み中…</div>
      ) : (
        <div className="calendar-heatmap-wrapper">
          {/* 月ラベル行 */}
          <div
            className="calendar-heatmap-months"
            style={{ gridTemplateColumns: `repeat(${totalWeeks}, 1fr)` }}
          >
            {Array.from({ length: totalWeeks }, (_, w) => {
              const label = monthLabels.find((m) => m.weekIndex === w);
              return (
                <div key={w} className="calendar-heatmap-month-label">
                  {label?.label ?? ""}
                </div>
              );
            })}
          </div>

          <div className="calendar-heatmap-body">
            {/* 曜日ラベル列 */}
            <div className="calendar-heatmap-days">
              {DAY_LABELS.map((label, i) => (
                <div key={i} className="calendar-heatmap-day-label">
                  {/* 月・水・金のみ表示してスペースを節約する */}
                  {i % 2 === 1 ? label : ""}
                </div>
              ))}
            </div>

            {/* ヒートマップグリッド: 縦 7 行 (曜日) × 横 N 週 */}
            <div
              className="calendar-heatmap"
              style={{ gridTemplateColumns: `repeat(${totalWeeks}, 1fr)` }}
            >
              {cells.map((cell, idx) => {
                const level = cell.inRange ? countToLevel(cell.count) : -1;
                const label = cell.dateStr
                  ? `${formatDateLabel(cell.dateStr)}: ${cell.count}件`
                  : "";
                return (
                  <div
                    key={idx}
                    className="calendar-heatmap-cell"
                    data-level={level >= 0 ? level : undefined}
                    aria-label={label || undefined}
                    title={label || undefined}
                    aria-hidden={!cell.inRange}
                  />
                );
              })}
            </div>
          </div>

          {/* 凡例 */}
          <div className="calendar-heatmap-legend">
            <span className="calendar-heatmap-legend-label">少</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <div key={level} className="calendar-heatmap-cell" data-level={level} aria-hidden />
            ))}
            <span className="calendar-heatmap-legend-label">多</span>
          </div>
        </div>
      )}
    </section>
  );
}
