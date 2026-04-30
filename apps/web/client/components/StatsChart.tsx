import type { TrendPoint } from "../hooks/useStats";

interface StatsChartProps {
  data: TrendPoint[];
  categories: Array<keyof Omit<TrendPoint, "date">>;
}

// カテゴリごとの色 (CSS 変数が使えないため直値; ライト/ダーク両対応の中間色)
const CATEGORY_COLORS: Record<string, string> = {
  bigtech: "#4493f8",
  ai: "#d29922",
  jp: "#3fb950",
  personal: "#a371f7",
};

const CHART_W = 800;
const CHART_H = 160;
const PAD_LEFT = 32;
const PAD_RIGHT = 8;
const PAD_TOP = 8;
const PAD_BOTTOM = 32;
const INNER_W = CHART_W - PAD_LEFT - PAD_RIGHT;
const INNER_H = CHART_H - PAD_TOP - PAD_BOTTOM;

export function StatsChart({ data, categories }: StatsChartProps) {
  if (data.length === 0) return null;

  // 各日の合計を計算して y 軸最大値を求める
  const totals = data.map((p) => categories.reduce((s, c) => s + p[c], 0));
  const maxTotal = Math.max(...totals, 1);

  const barCount = data.length;
  const barGap = 2;
  const barW = Math.max(1, (INNER_W - barGap * (barCount - 1)) / barCount);

  // x 軸ラベルは最初・中央・最後の 3 点のみ表示
  const labelIndices = new Set([0, Math.floor((barCount - 1) / 2), barCount - 1]);

  return (
    <figure className="m-0">
      {/* 凡例 */}
      <div className="flex flex-wrap gap-[var(--space-3)] mb-[var(--space-2)] text-[var(--font-size-sm)] text-[var(--fg-muted)]">
        {categories.map((cat) => (
          <span key={cat} className="flex items-center gap-[var(--space-1)]">
            <span
              className="inline-block w-[10px] h-[10px] rounded-[var(--radius-sm)] shrink-0"
              style={{ background: CATEGORY_COLORS[cat] ?? "#999" }}
            />
            {cat}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
        aria-label="カテゴリ別 30 日記事数トレンド"
        role="img"
        className="block w-full h-auto [aspect-ratio:800/160] text-[var(--fg-primary)]"
      >
        {/* y 軸グリッド線 (0 / 50% / 100%) */}
        {[0, 0.5, 1].map((ratio) => {
          const y = PAD_TOP + INNER_H * (1 - ratio);
          const label = Math.round(maxTotal * ratio);
          return (
            <g key={ratio}>
              <line
                x1={PAD_LEFT}
                y1={y}
                x2={CHART_W - PAD_RIGHT}
                y2={y}
                stroke="currentColor"
                strokeOpacity="0.15"
                strokeWidth="1"
              />
              <text
                x={PAD_LEFT - 4}
                y={y + 4}
                textAnchor="end"
                fontSize="10"
                fill="currentColor"
                fillOpacity="0.5"
              >
                {label}
              </text>
            </g>
          );
        })}

        {/* stacked bar */}
        {data.map((point, i) => {
          const x = PAD_LEFT + i * (barW + barGap);
          let cumH = 0;
          return (
            <g key={point.date}>
              {categories.map((cat) => {
                const val = point[cat];
                const h = (val / maxTotal) * INNER_H;
                const y = PAD_TOP + INNER_H - cumH - h;
                cumH += h;
                return (
                  <rect
                    key={cat}
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    fill={CATEGORY_COLORS[cat] ?? "#999"}
                    opacity="0.85"
                  >
                    <title>
                      {point.date} / {cat}: {val}
                    </title>
                  </rect>
                );
              })}
              {/* x 軸ラベル */}
              {labelIndices.has(i) && (
                <text
                  x={x + barW / 2}
                  y={CHART_H - 4}
                  textAnchor="middle"
                  fontSize="10"
                  fill="currentColor"
                  fillOpacity="0.6"
                >
                  {point.date.slice(5)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
