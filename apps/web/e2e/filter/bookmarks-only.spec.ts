import { expect, test } from "@playwright/test";
import { waitForArticles } from "../helpers";

test.describe("bookmarks only toggle", () => {
  test("ブックマーク追加 → ブックマークのみ表示で絞り込まれる", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);

    // ブックマークボタン (BookmarkButton) をクリック — aria-label "ブックマークに追加"
    const bookmarkBtn = page
      .locator("[data-article-id]")
      .first()
      .getByRole("button", { name: /ブックマーク/i });
    await bookmarkBtn.first().click();

    // ブックマークのみ表示ボタンをクリック (aria-pressed 属性を持つ ★ N 件ボタン)
    // /★ [1-9]/ を使って ★ 0 件 の状態では一致しないようにし、
    // ブックマーク追加後 (★ 1 件以上) になるまで Playwright に待機させる
    const bookmarkOnlyBtn = page.getByRole("button", { name: /★ [1-9]/ });
    await bookmarkOnlyBtn.click();

    // URL に bookmarks=only が付く
    await expect(page).toHaveURL(/bookmarks=only/, { timeout: 5_000 });

    // 記事が 1 件以上表示される
    const cards = page.locator("[data-article-id]");
    await expect(cards).toHaveCount(1, { timeout: 5_000 });
  });
});
