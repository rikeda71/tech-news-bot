import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { StatsDashboard } from "../../client/components/StatsDashboard";

const MOCK_STATS_RESPONSE = {
  total: 1234,
  last24h: 42,
  last7d: 210,
  last30d: 800,
  total_articles: 1234,
  articles_24h: 42,
  articles_7d: 210,
  articles_30d: 800,
  last_published_at: "2026-04-28T10:00:00Z",
  last_fetched_at: "2026-04-28T11:00:00Z",
  by_category: { bigtech: 300, ai: 250, jp: 200, personal: 150 },
  by_lang_30d: { ja: 500, en: 300 },
  top_authors_30d: [
    { author: "Alice", count: 30 },
    { author: "Bob", count: 25 },
    { author: "Charlie", count: 20 },
    { author: "Dave", count: 15 },
    { author: "Eve", count: 12 },
    { author: "Frank", count: 10 },
    { author: "Grace", count: 9 },
    { author: "Heidi", count: 8 },
    { author: "Ivan", count: 7 },
    { author: "Judy", count: 6 },
  ],
  top_publishers_30d: [
    { feed_id: "feed-a", name: "Feed A", count: 100 },
    { feed_id: "feed-b", name: "Feed B", count: 80 },
    { feed_id: "feed-c", name: "Feed C", count: 60 },
  ],
  stale_feeds: [],
  by_category_full: {},
  category_trend_30d: [],
  feed_activity: [],
};

// CalendarHeatmap の fetch をモックするため URL ごとにレスポンスを分岐する
function mockFetchSuccess() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation((url: string) => {
      if ((url as string).includes("/api/articles/calendar")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ days: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(MOCK_STATS_RESPONSE),
      });
    }),
  );
}

function mockFetchError() {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }),
  );
}

describe("StatsDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loading 状態を表示する", () => {
    // fetch が pending のまま
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<StatsDashboard />);
    expect(screen.getByText(/読み込み中/)).toBeTruthy();
  });

  it("エラー時にエラーメッセージを表示する", async () => {
    mockFetchError();
    render(<StatsDashboard />);
    const err = await screen.findByText(/エラー/);
    expect(err).toBeTruthy();
  });

  it("サマリカードに total_articles が表示される", async () => {
    mockFetchSuccess();
    render(<StatsDashboard />);
    await screen.findByText("1,234");
  });

  it("サマリカードに articles_24h が表示される", async () => {
    mockFetchSuccess();
    render(<StatsDashboard />);
    await screen.findByText("42");
  });

  it("サマリカードに articles_7d が表示される", async () => {
    mockFetchSuccess();
    render(<StatsDashboard />);
    await screen.findByText("210");
  });

  it("サマリカードに articles_30d が表示される", async () => {
    mockFetchSuccess();
    render(<StatsDashboard />);
    await screen.findByText("800");
  });

  it("top_authors_30d が上位 10 件表示される", async () => {
    mockFetchSuccess();
    render(<StatsDashboard />);
    await screen.findByText("Alice");
    expect(screen.getByText("Bob")).toBeTruthy();
    expect(screen.getByText("Judy")).toBeTruthy();
  });

  it("top_authors のバーに aria-label が設定される", async () => {
    mockFetchSuccess();
    render(<StatsDashboard />);
    await screen.findByText("Alice");
    const bar = screen.getByRole("img", { name: /Alice.*30/ });
    expect(bar).toBeTruthy();
  });

  it("top_publishers_30d が表示される", async () => {
    mockFetchSuccess();
    render(<StatsDashboard />);
    await screen.findByText("Feed A");
    expect(screen.getByText("Feed B")).toBeTruthy();
    expect(screen.getByText("Feed C")).toBeTruthy();
  });

  it("by_lang_30d の ja と en バーが表示される", async () => {
    mockFetchSuccess();
    render(<StatsDashboard />);
    await screen.findByText("ja");
    expect(screen.getByText("en")).toBeTruthy();
  });

  it("by_lang バーの aria-label に件数が含まれる", async () => {
    mockFetchSuccess();
    render(<StatsDashboard />);
    // ja: 500件 のバー
    const jaBar = await screen.findByRole("img", { name: /ja.*500/ });
    expect(jaBar).toBeTruthy();
    const enBar = screen.getByRole("img", { name: /en.*300/ });
    expect(enBar).toBeTruthy();
  });

  it("by_category が表示される", async () => {
    mockFetchSuccess();
    render(<StatsDashboard />);
    await screen.findByText("bigtech");
    expect(screen.getByText("ai")).toBeTruthy();
    expect(screen.getByText("jp")).toBeTruthy();
    expect(screen.getByText("personal")).toBeTruthy();
  });

  it("活動カレンダーセクションが描画される", async () => {
    mockFetchSuccess();
    render(<StatsDashboard />);
    // CalendarHeatmap の見出しが表示されることを確認 (空データでも OK)
    const heading = await screen.findByText("活動カレンダー");
    expect(heading).toBeTruthy();
  });
});
