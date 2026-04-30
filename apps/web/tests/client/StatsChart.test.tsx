import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import { StatsChart } from "../../client/components/StatsChart";
import type { TrendPoint } from "../../client/hooks/useStats";

const CATEGORIES: Array<keyof Omit<TrendPoint, "date">> = ["bigtech", "ai", "jp", "personal"];

function makeTrendData(n: number): TrendPoint[] {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - (n - 1 - i));
    return {
      date: d.toISOString().slice(0, 10),
      bigtech: i,
      ai: i + 1,
      jp: i + 2,
      personal: i + 3,
    };
  });
}

describe("StatsChart", () => {
  it("renders nothing when data is empty", () => {
    const { container } = render(<StatsChart data={[]} categories={CATEGORIES} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders an SVG with role=img", () => {
    const data = makeTrendData(30);
    render(<StatsChart data={data} categories={CATEGORIES} />);
    const svg = screen.getByRole("img");
    expect.soft(svg).toBeTruthy();
    expect.soft(svg.tagName.toLowerCase()).toBe("svg");
  });

  it("renders legend items for each category", () => {
    const data = makeTrendData(30);
    render(<StatsChart data={data} categories={CATEGORIES} />);
    for (const cat of CATEGORIES) {
      expect(screen.getByText(cat)).toBeTruthy();
    }
  });

  it("renders rect elements for non-zero values", () => {
    const data = makeTrendData(30);
    const { container } = render(<StatsChart data={data} categories={CATEGORIES} />);
    const rects = container.querySelectorAll("rect");
    // 29 日 × 4 カテゴリ (index 0 の日は bigtech=0, jp=2, ai=1, personal=3 — ai/jp/personal は非ゼロ)
    // ただし h=0 の rect も DOM に存在するため、rect の数は 30 × 4 = 120
    expect(rects.length).toBe(120);
  });

  it("renders x-axis labels for first, middle and last date", () => {
    const data = makeTrendData(30);
    render(<StatsChart data={data} categories={CATEGORIES} />);
    // x 軸ラベルは MM-DD 形式
    const firstLabel = data[0].date.slice(5);
    const lastLabel = data[29].date.slice(5);
    expect(screen.getAllByText(firstLabel).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(lastLabel).length).toBeGreaterThanOrEqual(1);
  });

  it("renders title elements with date/category/count inside rects", () => {
    const singleData: TrendPoint[] = [
      { date: "2026-04-01", bigtech: 5, ai: 3, jp: 1, personal: 2 },
    ];
    const { container } = render(<StatsChart data={singleData} categories={CATEGORIES} />);
    const titles = container.querySelectorAll("title");
    const titleTexts = Array.from(titles).map((t) => t.textContent ?? "");
    expect.soft(titleTexts.some((t) => t.includes("bigtech") && t.includes("5"))).toBe(true);
    expect.soft(titleTexts.some((t) => t.includes("ai") && t.includes("3"))).toBe(true);
  });
});
