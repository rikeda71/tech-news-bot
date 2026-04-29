import { expect, test } from "@playwright/test";
import { waitForArticles } from "../helpers";

test.describe("article detail (feed drill-down)", () => {
  test("記事カードの取得元クリックでフィード詳細へ遷移し、戻るで戻れる", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);

    // 最初のカードの取得元ボタン (feed name ボタン) をクリック
    // title 属性 "で絞り込む" を持つボタンが feed name ボタン
    const firstCard = page.locator("[data-article-id]").first();
    const feedNameBtn = firstCard.locator("button[title*='で絞り込む']").last();
    await feedNameBtn.click();

    // URL が /feed/* に変わる
    await expect(page).toHaveURL(/\/feed\/.+/, { timeout: 5_000 });

    // 戻るボタン (「← 一覧に戻る」) で / に戻る
    await page.getByRole("button", { name: /一覧に戻る/ }).click();
    await expect(page).toHaveURL("/");
  });
});
