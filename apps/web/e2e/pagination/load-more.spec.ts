import { expect, test } from "@playwright/test";
import { waitForArticles } from "../helpers";

test.describe("pagination / load more", () => {
  test("もっと読み込むで次ページが追加表示される", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);

    const initialCount = await page.locator("[data-article-id]").count();

    // もっと読み込むボタンが表示されている場合のみテスト (seed 件数次第)
    const loadMoreBtn = page.getByRole("button", { name: "もっと読み込む" });
    const hasMore = await loadMoreBtn.isVisible({ timeout: 3_000 }).catch(() => false);

    if (!hasMore) {
      // seed データが 1 ページ内に収まる場合はスキップ (21 件で /api/articles の limit=20 を超える想定)
      test.skip();
      return;
    }

    await loadMoreBtn.click();

    // ボタンが "読み込み中…" になる → 消えるか再表示
    await page.waitForTimeout(1_000);

    // 記事数が増えている
    const newCount = await page.locator("[data-article-id]").count();
    expect(newCount).toBeGreaterThan(initialCount);
  });
});
