import { expect, test } from "@playwright/test";
import { waitForArticles } from "../helpers";

test.describe("search", () => {
  test("検索ボックスに入力すると URL の ?q= が更新される", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);

    // 検索ボックスに入力 (placeholder で特定)
    const searchInput = page.locator("input[type='search']");
    await searchInput.fill("Gemini");

    // debounce (300ms) + URL 反映を待つ
    await expect(page).toHaveURL(/q=Gemini/, { timeout: 5_000 });
  });

  test("?q=Gemini で直接アクセスすると絞り込まれた状態になる", async ({ page }) => {
    await page.goto("/?q=Gemini");

    // 記事が表示されるまで待つ (0 件でも構わないが検索 input に値が入る)
    const searchInput = page.locator("input[type='search']");
    await expect(searchInput).toHaveValue("Gemini", { timeout: 10_000 });
  });
});
