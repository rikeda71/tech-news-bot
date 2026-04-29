import { expect, test } from "@playwright/test";
import { waitForArticles } from "../helpers";

test.describe("home page smoke", () => {
  test("ヘッダー・記事カード・件数表示が見える", async ({ page }) => {
    await page.goto("/");

    // ヘッダーにサイト名が表示される
    await expect(page.getByRole("heading", { name: "Tech News Bot" })).toBeVisible();

    // ナビゲーションタブが表示される
    await expect(page.getByRole("button", { name: "Articles" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stats" })).toBeVisible();
    await expect(page.getByRole("button", { name: "カテゴリ" })).toBeVisible();

    // 記事カードが 1 件以上表示される
    await waitForArticles(page);
    const cards = page.locator("[data-article-id]");
    await expect(cards.first()).toBeVisible();

    // 件数表示がある (stats API から取得するため "N 記事" の形式で表示される)
    await expect(
      page
        .locator("span")
        .filter({ hasText: /\d+ 記事/ })
        .first(),
    ).toBeVisible({
      timeout: 10_000,
    });
  });

  test("検索ボックスが表示される", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("input[placeholder]")).toBeVisible({ timeout: 10_000 });
  });
});
