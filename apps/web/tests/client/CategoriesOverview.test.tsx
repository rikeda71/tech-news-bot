import { render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { CategoriesResponse } from "../../client/types/api";

const { CategoriesOverview } = await import("../../client/components/CategoriesOverview");

const sampleResponse: CategoriesResponse = {
  categories: [
    {
      id: "bigtech",
      label: "Big Tech",
      feeds_count: 5,
      articles_30d: 120,
      last_published_at: "2024-01-15T10:00:00Z",
    },
    {
      id: "ai",
      label: "AI",
      feeds_count: 8,
      articles_30d: 200,
      last_published_at: null,
    },
    {
      id: "jp",
      label: "日本企業",
      feeds_count: 3,
      articles_30d: 50,
      last_published_at: "2024-01-14T12:00:00Z",
    },
    {
      id: "zenn",
      label: "Zenn",
      feeds_count: 10,
      articles_30d: 300,
      last_published_at: "2024-01-15T08:00:00Z",
    },
  ],
};

const noop = () => {};

describe("CategoriesOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("ローディング中は読み込み中テキストを表示する", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<CategoriesOverview onSelectCategory={noop} />);
    expect(screen.getByText("読み込み中…")).toBeTruthy();
  });

  it("4 カテゴリのカードを表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      }),
    );

    render(<CategoriesOverview onSelectCategory={noop} />);

    await waitFor(() => {
      expect(screen.getByText("Big Tech")).toBeTruthy();
    });

    expect(screen.getByText("AI")).toBeTruthy();
    expect(screen.getByText("日本企業")).toBeTruthy();
    expect(screen.getByText("Zenn")).toBeTruthy();
  });

  it("feeds_count と articles_30d を表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      }),
    );

    render(<CategoriesOverview onSelectCategory={noop} />);

    await waitFor(() => {
      expect(screen.getByText("Big Tech")).toBeTruthy();
    });

    // bigtech: feeds_count=5, articles_30d=120
    const statValues = screen.getAllByText("5");
    expect(statValues.length).toBeGreaterThan(0);
    expect(screen.getByText("120")).toBeTruthy();
  });

  it("last_published_at が null の場合は「—」を表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      }),
    );

    render(<CategoriesOverview onSelectCategory={noop} />);

    await waitFor(() => {
      expect(screen.getByText("AI")).toBeTruthy();
    });

    // ai の last_published_at は null なので「—」が表示される
    expect(screen.getByText("—")).toBeTruthy();
  });

  it("エラー時にエラーメッセージを表示する", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    );

    render(<CategoriesOverview onSelectCategory={noop} />);

    await waitFor(() => {
      expect(screen.getByText(/取得エラー/)).toBeTruthy();
    });
  });

  it("カードクリックで onSelectCategory が呼ばれる", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(sampleResponse),
      }),
    );

    const onSelectCategory = vi.fn<(id: string) => void>();
    const user = userEvent.setup();
    render(<CategoriesOverview onSelectCategory={onSelectCategory} />);

    await waitFor(() => {
      expect(screen.getByText("Big Tech")).toBeTruthy();
    });

    // Big Tech カードをクリック
    const bigTechCard = screen.getByText("Big Tech").closest("button");
    expect(bigTechCard).toBeTruthy();
    await user.click(bigTechCard!);

    expect(onSelectCategory).toHaveBeenCalledWith("bigtech");
  });
});
