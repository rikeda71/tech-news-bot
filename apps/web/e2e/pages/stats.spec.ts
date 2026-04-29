import { expect, test } from "@playwright/test";

test.describe("stats page", () => {
  test("/stats ページで集計情報が表示される", async ({ page }) => {
    await page.goto("/");

    // Stats タブをクリック
    await page.getByRole("button", { name: "Stats" }).click();
    await expect(page).toHaveURL("/stats", { timeout: 5_000 });

    // Stats ページのコンテンツが表示される (StatsDashboard)
    // 少なくとも何らかのテキストコンテンツがある
    await expect(page.locator("main, [class*='max-w']").first()).toBeVisible({ timeout: 10_000 });
  });

  test("Stats タブが active 状態になる", async ({ page }) => {
    await page.goto("/stats");

    // Stats ボタンが aria-current="page" になる
    const statsBtn = page.getByRole("button", { name: "Stats" });
    await expect(statsBtn).toHaveAttribute("aria-current", "page", { timeout: 5_000 });
  });
});
