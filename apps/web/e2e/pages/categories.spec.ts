import { expect, test } from "@playwright/test";

test.describe("categories page", () => {
  test("/categories ページでカテゴリ一覧が表示される", async ({ page }) => {
    await page.goto("/");

    // カテゴリタブをクリック
    await page.getByRole("button", { name: "カテゴリ" }).click();
    await expect(page).toHaveURL("/categories", { timeout: 5_000 });

    // カテゴリページが表示される (カテゴリ名が見える)
    await expect(page.getByText("Big Tech")).toBeVisible({ timeout: 10_000 });
  });

  test("カテゴリタブが active 状態になる", async ({ page }) => {
    await page.goto("/categories");

    // カテゴリボタンが aria-current="page" になる
    const catBtn = page.getByRole("button", { name: "カテゴリ" });
    await expect(catBtn).toHaveAttribute("aria-current", "page", { timeout: 5_000 });
  });

  test("カテゴリカードをクリックすると articles ページへ遷移する", async ({ page }) => {
    await page.goto("/categories");

    // Big Tech カードをクリック (button として実装されている)
    await page.getByText("Big Tech").first().click();

    // / ページに戻りフィルタが適用される
    await expect(page).toHaveURL(/category=bigtech/, { timeout: 5_000 });
  });
});
