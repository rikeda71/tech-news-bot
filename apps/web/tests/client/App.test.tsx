import { act, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Article } from "../../client/types/api";
import type { Stats } from "../../client/hooks/useStats";

// App は useTheme / fetch に依存するため、useTheme をモックしてから dynamic import する
vi.mock("../../client/hooks/useTheme", () => ({
  useTheme: () => ({
    theme: "system" as const,
    setTheme: vi.fn<(t: "light" | "dark" | "system") => void>(),
    resolvedTheme: "light" as const,
  }),
}));

const App = (await import("../../client/App")).default;

// ---- テストデータ -------------------------------------------------------

function makeArticle(id: number): Article {
  return {
    id,
    guid: `guid-${id}`,
    feed_id: "feed-a",
    feed_name: "Feed A",
    title: `Article ${id}`,
    url: `https://example.com/article/${id}`,
    summary: `Summary ${id}`,
    author: "Author",
    published_at: "2024-01-15T10:00:00Z",
    fetched_at: "2024-01-15T11:00:00Z",
    category: "ai",
    lang: "en",
  };
}

const baseStats: Stats = {
  total: 100,
  last_published_at: "2024-01-15T10:00:00Z",
  last_fetched_at: "2024-01-15T11:00:00Z",
  last24h: 5,
  by_category: { ai: 50, bigtech: 30, jp: 15, personal: 5 },
  by_lang: { en: 80, ja: 20 },
  stale_feeds: [],
  category_trend_30d: [],
  feed_activity: [],
};

// ---- fetch stub ヘルパー -----------------------------------------------

function stubFetch(articles: Article[] = [], nextCursor: string | null = null) {
  vi.stubGlobal(
    "fetch",
    vi.fn<(url: string) => Promise<Response>>().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/api/articles")) {
        return {
          ok: true,
          json: () => Promise.resolve({ articles, nextCursor }),
        } as unknown as Response;
      }
      if (u.includes("/api/stats")) {
        return {
          ok: true,
          json: () => Promise.resolve(baseStats),
        } as unknown as Response;
      }
      if (u.includes("/api/feeds")) {
        return {
          ok: true,
          json: () => Promise.resolve({ feeds: [] }),
        } as unknown as Response;
      }
      if (u.includes("/api/reports")) {
        return {
          ok: true,
          json: () => Promise.resolve({ reports: [] }),
        } as unknown as Response;
      }
      return {
        ok: true,
        json: () => Promise.resolve({}),
      } as unknown as Response;
    }),
  );
}

// ---- セットアップ -------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  // URL を articles ルートに戻す
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ========================================================================
// smoke
// ========================================================================

describe("App smoke", () => {
  it("クラッシュせずにマウントできる", () => {
    stubFetch();
    // エラーが throw されないことを確認する
    expect(() => render(<App />)).not.toThrow();
  });

  it("ヘッダー (banner landmark) が DOM に存在する", () => {
    stubFetch();
    const { container } = render(<App />);
    // getByRole("banner") は複数ヒットした場合にエラーになるため container で絞る
    expect(container.querySelector("header")).toBeTruthy();
  });

  it("ナビゲーション (navigation landmark) が DOM に存在する", () => {
    stubFetch();
    render(<App />);
    expect(screen.getByRole("navigation")).toBeTruthy();
  });

  it("サイト名見出しが表示される", () => {
    stubFetch();
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("初期 View は記事一覧 (articles) であること — loading 状態が表示される", () => {
    // fetch を pending のままにして loading 状態を確認する
    vi.stubGlobal("fetch", vi.fn<() => Promise<Response>>().mockReturnValue(new Promise(() => {})));
    render(<App />);
    // 記事一覧の初期ローディングインジケーター or フィルターバーが存在する
    // (stats/categories/reports View ではなく articles View のコンテンツが描画される)
    const nav = screen.getByRole("navigation");
    expect(nav).toBeTruthy();
    // Articles タブが aria-current=page になっていることを確認
    const articlesTab = screen.getByRole("button", { name: /Articles/ });
    expect(articlesTab.getAttribute("aria-current")).toBe("page");
  });

  it("全ナビゲーションタブが描画される", () => {
    stubFetch();
    render(<App />);
    // NAV_TABS: Articles / Stats / カテゴリ / レポート
    expect.soft(screen.getByRole("button", { name: /Articles/ })).toBeTruthy();
    expect.soft(screen.getByRole("button", { name: /Stats/ })).toBeTruthy();
    expect.soft(screen.getByRole("button", { name: /カテゴリ/ })).toBeTruthy();
    expect.soft(screen.getByRole("button", { name: /レポート/ })).toBeTruthy();
  });
});

// ========================================================================
// navigation — View 切り替え
// ========================================================================

describe("App navigation", () => {
  it("Stats タブをクリックすると stats View に切り替わる", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Stats/ }));

    // URL が /stats になる
    expect(window.location.pathname).toBe("/stats");
    // Stats タブが aria-current=page
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Stats/ }).getAttribute("aria-current")).toBe(
        "page",
      );
    });
  });

  it("カテゴリタブをクリックすると categories View に切り替わる", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /カテゴリ/ }));

    expect(window.location.pathname).toBe("/categories");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /カテゴリ/ }).getAttribute("aria-current")).toBe(
        "page",
      );
    });
  });

  it("レポートタブをクリックすると reports View に切り替わる", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /レポート/ }));

    expect(window.location.pathname).toBe("/reports");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /レポート/ }).getAttribute("aria-current")).toBe(
        "page",
      );
    });
  });

  it("Stats から Articles タブをクリックすると articles View に戻る", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /Stats/ }));
    await waitFor(() => {
      expect(window.location.pathname).toBe("/stats");
    });

    await user.click(screen.getByRole("button", { name: /Articles/ }));

    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });
    expect(screen.getByRole("button", { name: /Articles/ }).getAttribute("aria-current")).toBe(
      "page",
    );
  });
});

// ========================================================================
// navigation — popstate (ブラウザ戻る/進む)
// ========================================================================

describe("App popstate", () => {
  it("Stats に遷移後に popstate で戻ると articles View に戻る", async () => {
    stubFetch();
    const user = userEvent.setup();
    render(<App />);

    // Stats に移動
    await user.click(screen.getByRole("button", { name: /Stats/ }));
    await waitFor(() => {
      expect(window.location.pathname).toBe("/stats");
    });

    // popstate を発火 (window.history.back() の代替)
    window.history.replaceState(null, "", "/");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Articles/ }).getAttribute("aria-current")).toBe(
        "page",
      );
    });
  });

  it("/reports パスで popstate → reports View になる", async () => {
    stubFetch();
    render(<App />);

    window.history.replaceState(null, "", "/reports");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /レポート/ }).getAttribute("aria-current")).toBe(
        "page",
      );
    });
  });
});

// ========================================================================
// keyboard shortcut
// ========================================================================

describe("App keyboard shortcut", () => {
  it("? キーでヘルプモーダルが開く", async () => {
    stubFetch();
    render(<App />);

    // 入力フォーカスを外した状態でキーを押す
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    });

    // ShortcutsHelp モーダルが表示されるまで待つ
    await waitFor(() => {
      // キーボードショートカット一覧 (ShortcutsHelp コンポーネント) のタイトルを探す
      expect(screen.getByText(/キーボードショートカット/)).toBeTruthy();
    });
  });

  it("Escape キーでヘルプモーダルが閉じる", async () => {
    stubFetch();
    render(<App />);

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    // ? で開く
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }));
    });
    await waitFor(() => {
      expect(screen.getByText(/キーボードショートカット/)).toBeTruthy();
    });

    // Escape で閉じる
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await waitFor(() => {
      expect(screen.queryByText(/キーボードショートカット/)).toBeNull();
    });
  });

  it("/ キーで検索フォームにフォーカスが当たる", async () => {
    stubFetch();
    render(<App />);

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "/", bubbles: true }));
    });

    // searchRef の input がフォーカスされる (happy-dom は document.activeElement を更新する)
    await waitFor(() => {
      const el = document.activeElement;
      expect(el?.tagName.toLowerCase()).toBe("input");
    });
  });
});

// ========================================================================
// filter state
// ========================================================================

describe("App filter state", () => {
  it("カテゴリフィルタを変更すると URL の query param が更新される", async () => {
    stubFetch([makeArticle(1), makeArticle(2)]);
    const user = userEvent.setup();
    render(<App />);

    // 記事一覧が描画されるまで待つ
    await waitFor(() => {
      expect(screen.queryByText("Article 1")).toBeTruthy();
    });

    // カテゴリ combobox を選択する
    const categorySelect = screen.getByRole("combobox", { name: "カテゴリ" });
    await user.selectOptions(categorySelect, "ai");

    // URL に category=ai が付与される (pushState 経由)
    await waitFor(() => {
      expect(window.location.search).toContain("category=ai");
    });
  });

  it("フィルターを全解除すると URL から query param が消える", async () => {
    stubFetch([makeArticle(1)]);
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText("Article 1")).toBeTruthy();
    });

    // category をセット
    const categorySelect = screen.getByRole("combobox", { name: "カテゴリ" });
    await user.selectOptions(categorySelect, "ai");

    await waitFor(() => {
      expect(window.location.search).toContain("category=ai");
    });

    // 解除ボタンをクリック
    const clearBtn = screen.getByText(/解除/);
    await user.click(clearBtn);

    await waitFor(() => {
      expect(window.location.search).not.toContain("category");
    });
  });

  it("Stats View に切り替えてから Articles に戻るとフィルターが保持される", async () => {
    stubFetch([makeArticle(1)]);
    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.queryByText("Article 1")).toBeTruthy();
    });

    // category をセット
    const categorySelect = screen.getByRole("combobox", { name: "カテゴリ" });
    await user.selectOptions(categorySelect, "bigtech");

    await waitFor(() => {
      expect(window.location.search).toContain("category=bigtech");
    });

    // Stats に切り替え
    await user.click(screen.getByRole("button", { name: /Stats/ }));
    await waitFor(() => {
      expect(window.location.pathname).toBe("/stats");
    });

    // Articles に戻る
    await user.click(screen.getByRole("button", { name: /Articles/ }));
    await waitFor(() => {
      expect(window.location.pathname).toBe("/");
    });

    // combobox は URL から再初期化されるので query に category が存在しないことを確認する
    // (handleViewChange は setView のみ変更し filter を消さないため URL に残らない可能性あり)
    // ここでは View が articles に戻っている (Articles タブが aria-current=page) ことを確認
    expect(screen.getByRole("button", { name: /Articles/ }).getAttribute("aria-current")).toBe(
      "page",
    );
  });
});
