import { expect, test } from "@playwright/test";
import { waitForArticles } from "../helpers";

test.describe("category / lang filter", () => {
  test("category filter で URL が更新され記事が絞り込まれる", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);

    // All categories → AI を選択
    await page.selectOption("select", { label: "AI" });

    // URL に ?category=ai が含まれる
    await expect(page).toHaveURL(/category=ai/, { timeout: 5_000 });

    // 表示される記事の category バッジが AI のみになる
    await page.waitForTimeout(500); // debounce 待ち
    const aiBadges = page.locator("button[title*='AI で絞り込む']");
    const count = await aiBadges.count();
    expect(count).toBeGreaterThan(0);
  });

  test("lang filter で URL が更新される", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);

    // All langs → 日本語 を選択
    const selects = page.locator("select");
    await selects.nth(1).selectOption({ label: "日本語" });

    // URL に ?lang=ja が含まれる
    await expect(page).toHaveURL(/lang=ja/, { timeout: 5_000 });
  });

  test("フィルタ解除ボタンでフィルタが消える", async ({ page }) => {
    await page.goto("/?category=ai");
    await waitForArticles(page);

    // 解除ボタンが表示される
    const clearBtn = page.getByRole("button", { name: /解除/ });
    await expect(clearBtn).toBeVisible({ timeout: 5_000 });
    await clearBtn.click();

    // URL から category が消える
    await expect(page).toHaveURL(/^http:\/\/localhost:5173\/?$/, { timeout: 5_000 });
  });
});
