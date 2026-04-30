import type { TrendPoint } from "../hooks/useStats";

interface StatsChartProps {
  data: TrendPoint[];
  categories: Array<keyof Omit<TrendPoint, "date">>;
}

// カテゴリごとの色 (CSS 変数が使えないため直値; ライト/ダーク両対応の中間色)
// zenn は bigtech との判別性確保のため青ではなく紫に変更
const CATEGORY_COLORS: Record<string, string> = {
  bigtech: "#4493f8",
  ai: "#d29922",
  jp: "#3fb950",
  zenn: "#a371f7",
};

const CHART_W = 800;
const CHART_H = 220;
const PAD_LEFT = 36;
const PAD_RIGHT = 12;
const PAD_TOP = 12;
const PAD_BOTTOM = 36;
const INNER_W = CHART_W - PAD_LEFT - PAD_RIGHT;
const INNER_H = CHART_H - PAD_TOP - PAD_BOTTOM;

// y 軸の上限を「キリのいい値」に丸める (50 / 100 / 200 …)
function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const exp = Math.floor(Math.log10(value));
  const base = 10 ** exp;
  const f = value / base;
  const niceF = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return niceF * base;
}

export function StatsChart({ data, categories }: StatsChartProps) {
  if (data.length === 0) return null;

  // 各日の合計を計算して y 軸最大値を求める
  const totals = data.map((p) => categories.reduce((s, c) => s + p[c], 0));
  const rawMax = Math.max(...totals, 1);
  const maxTotal = niceCeil(rawMax);

  const barCount = data.length;
  const barGap = 2;
  const barW = Math.max(1, (INNER_W - barGap * (barCount - 1)) / barCount);

  // x 軸ラベル: 7 日刻みに加え、必ず先頭と末尾を含める
  const labelStep = Math.max(1, Math.floor(barCount / 5));
  const labelIndices = new Set<number>();
  labelIndices.add(0);
  labelIndices.add(barCount - 1);
  for (let i = 0; i < barCount; i += labelStep) labelIndices.add(i);

  // y 軸グリッド/ラベル: 5 等分 (0%, 25%, 50%, 75%, 100%)
  const gridRatios = [0, 0.25, 0.5, 0.75, 1];

  return (
    <figure className="m-0">
      {/* 凡例 */}
      <div className="flex flex-wrap gap-[var(--space-3)] mb-[var(--space-3)] text-[var(--font-size-sm)] text-[var(--fg-secondary)]">
        {categories.map((cat) => (
          <span key={cat} className="flex items-center gap-[var(--space-1)]">
            <span
              className="inline-block w-[12px] h-[12px] rounded-[var(--radius-sm)] shrink-0"
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
        className="block w-full h-auto [aspect-ratio:800/220] text-[var(--fg-primary)]"
      >
        {/* y 軸グリッド線 + ラベル */}
        {gridRatios.map((ratio) => {
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
                strokeOpacity={ratio === 0 ? "0.35" : "0.15"}
                strokeWidth="1"
                strokeDasharray={ratio === 0 ? "" : "3 3"}
              />
              <text
                x={PAD_LEFT - 6}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="currentColor"
                fillOpacity="0.65"
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
                  y={CHART_H - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill="currentColor"
                  fillOpacity="0.65"
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
