import { expect, test } from "@playwright/test";
import { waitForArticles } from "../helpers";

test.describe("bookmarks only toggle", () => {
  test("ブックマーク追加 → ブックマークのみ表示で絞り込まれる", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);

    // ブックマークボタン (BookmarkButton) をクリック — aria-label "ブックマークに追加"
    // hover してから click することで ArticleCard の onFocus による DOM 変化の前に
    // hover 状態を安定させ、確実に BookmarkButton の onClick を発火させる
    const bookmarkBtn = page
      .locator("[data-article-id]")
      .first()
      .getByRole("button", { name: "ブックマークに追加" });
    await bookmarkBtn.hover();
    await bookmarkBtn.click();

    // ブックマーク件数ボタンが ★ 1 件 以上に更新されるまで待つ
    // (localStorage への書き込みと React 再レンダリングが完了するのを確認)
    const bookmarkOnlyBtn = page.getByRole("button", { name: /★ [1-9]/ });
    await expect(bookmarkOnlyBtn).toBeVisible({ timeout: 5_000 });

    // ブックマークのみ表示ボタンをクリック
    await bookmarkOnlyBtn.click();

    // URL に bookmarks=only が付く
    await expect(page).toHaveURL(/bookmarks=only/, { timeout: 5_000 });

    // 記事が 1 件以上表示される
    const cards = page.locator("[data-article-id]");
    await expect(cards).toHaveCount(1, { timeout: 5_000 });
  });
});
