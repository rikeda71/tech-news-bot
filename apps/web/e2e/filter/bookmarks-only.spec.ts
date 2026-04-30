import { expect, test } from "@playwright/test";
import { waitForArticles } from "../helpers";

test.describe("bookmarks only toggle", () => {
  test("ブックマーク追加 → ブックマークのみ表示で絞り込まれる", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);

    // ブックマークボタン (BookmarkButton) をクリック — aria-label "ブックマークに追加"
    const firstCard = page.locator("[data-article-id]").first();
    const bookmarkBtn = firstCard.getByRole("button", { name: "ブックマークに追加" });
    await bookmarkBtn.click();

    // ブックマーク追加が localStorage に書き込まれるまで待つ
    await page.waitForFunction(
      () => {
        const raw = localStorage.getItem("tnb:bookmarks:v1");
        if (!raw) return false;
        try {
          const arr: unknown = JSON.parse(raw);
          return Array.isArray(arr) && (arr as unknown[]).length > 0;
        } catch {
          return false;
        }
      },
      { timeout: 5_000 },
    );

    // ブックマークのみ表示ボタンをクリック (aria-label "ブックマーク N 件のみ表示")
    const bookmarkOnlyBtn = page.getByRole("button", { name: /ブックマーク \d+ 件のみ表示/ });
    await bookmarkOnlyBtn.click();

    // URL に bookmarks=only が付く
    await expect(page).toHaveURL(/bookmarks=only/, { timeout: 5_000 });

    // 記事が 1 件以上表示される
    const cards = page.locator("[data-article-id]");
    await expect(cards).toHaveCount(1, { timeout: 5_000 });
  });
});
