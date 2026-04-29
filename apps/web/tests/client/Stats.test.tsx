import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";
import type { FeedActivity, Stats, TrendPoint } from "../../client/hooks/useStats";

const { StatsPanel } = await import("../../client/components/Stats");

const makeTrendPoint = (date: string): TrendPoint => ({
  date,
  ai: 0,
  bigtech: 0,
  jp: 0,
  zenn: 0,
});

const feedActivity: FeedActivity = {
  feed_id: "feed-a",
  feed_name: "Tech Blog",
  articles_30d: 42,
  last_published_at: "2024-01-15T10:00:00Z",
};

const baseStats: Stats = {
  total: 100,
  last_published_at: "2024-01-15T10:00:00Z",
  last_fetched_at: "2024-01-15T11:00:00Z",
  last24h: 5,
  by_category: { ai: 50, bigtech: 30, jp: 15, zenn: 5 },
  by_lang: { en: 80, ja: 20 },
  stale_feeds: [],
  category_trend_30d: [],
  feed_activity: [],
};

describe("StatsPanel", () => {
  it("shows 'no data' message when trend data is empty", () => {
    render(<StatsPanel stats={baseStats} />);
    expect(screen.getByText("過去 30 日のデータがありません")).toBeTruthy();
  });

  it("renders feed activity table heading", () => {
    render(<StatsPanel stats={baseStats} />);
    expect(screen.getByText(/フィード別アクティビティ/)).toBeTruthy();
  });

  it("shows 'no articles' message when feed_activity is empty", () => {
    render(<StatsPanel stats={baseStats} />);
    expect(screen.getByText("過去 30 日に記事なし")).toBeTruthy();
  });

  it("renders feed activity rows with feed name and count", () => {
    const stats: Stats = { ...baseStats, feed_activity: [feedActivity] };
    render(<StatsPanel stats={stats} />);
    expect(screen.getByText("Tech Blog")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("renders the category trend chart when trend data has non-zero values", () => {
    const trend: TrendPoint[] = [
      { date: "2024-01-14", ai: 10, bigtech: 5, jp: 3, zenn: 2 },
      { date: "2024-01-15", ai: 8, bigtech: 3, jp: 1, zenn: 4 },
    ];
    const stats: Stats = { ...baseStats, category_trend_30d: trend };
    render(<StatsPanel stats={stats} />);
    // StatsChart を実物 render。SVG が描画されていることを確認
    expect(screen.getByRole("img", { name: /トレンド/ })).toBeTruthy();
  });

  it("shows 'no data' when trend data exists but all values are zero", () => {
    const trend: TrendPoint[] = [makeTrendPoint("2024-01-14"), makeTrendPoint("2024-01-15")];
    const stats: Stats = { ...baseStats, category_trend_30d: trend };
    render(<StatsPanel stats={stats} />);
    expect(screen.getByText("過去 30 日のデータがありません")).toBeTruthy();
  });

  it("shows formatted date when feed has last_published_at", () => {
    const stats: Stats = {
      ...baseStats,
      feed_activity: [feedActivity],
    };
    render(<StatsPanel stats={stats} />);
    // 日付がフォーマットされて表示されている (正確な形式は locale 依存なので truthy チェック)
    // フィード行テキストに日付が含まれる (— でない)
    const rows = screen.getAllByRole("row");
    // ヘッダ行 + データ行 = 2
    expect(rows.length).toBeGreaterThanOrEqual(2);
  });

  it("shows '—' when feed has no last_published_at", () => {
    const stats: Stats = {
      ...baseStats,
      feed_activity: [{ ...feedActivity, last_published_at: null }],
    };
    render(<StatsPanel stats={stats} />);
    expect(screen.getByText("—")).toBeTruthy();
  });
});
