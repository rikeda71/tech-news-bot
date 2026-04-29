import { expect, test } from "@playwright/test";
import { waitForArticles } from "../helpers";

// キーボードショートカットはウィンドウフォーカスに依存するため直列実行する
test.describe.serial("keyboard shortcuts", () => {
  test("/ キーで検索ボックスにフォーカスが当たる", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);
    // ブラウザウィンドウを前面に出してキーイベントが確実に届くようにする
    await page.bringToFront();

    // 記事カードをクリックして input フォーカス外に出てから / を押す
    // (Tab などでどこかにフォーカスがあると isInputFocused() が true になり無視される)
    const card = page.locator("[data-article-id]").first();
    await card.click({ position: { x: 5, y: 5 } });
    // blur して input 以外にフォーカスを移す
    await page.keyboard.press("Escape");
    await page.waitForTimeout(100);
    await page.keyboard.press("/");

    // 検索ボックスがフォーカスされる
    const searchInput = page.locator("input[type='search']");
    await expect(searchInput).toBeFocused({ timeout: 5_000 });
  });

  test("? キーでショートカット一覧 modal が開く", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);
    await page.bringToFront();

    // body にフォーカス → ? を押す
    await page.locator("body").click();
    await page.keyboard.press("Shift+?");

    // ショートカット modal が表示される
    const modal = page.getByRole("dialog", { name: "キーボードショートカット" });
    await expect(modal).toBeVisible({ timeout: 3_000 });

    // Esc で閉じる
    await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible({ timeout: 3_000 });
  });

  test("j/k キーで記事選択が移動する", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);
    await page.bringToFront();

    // body をクリックして非 input 要素にフォーカスを当ててから j を押す
    await page.locator("body").click();
    await page.keyboard.press("j");

    // selectedIndex が 0 になると最初のカードに bg-[var(--accent-soft)] クラスが付く
    // CSS class の完全一致ではなく evaluate で class list を確認する
    const firstCard = page.locator("[data-article-id]").first();
    await expect
      .poll(
        async () => {
          const cls = await firstCard.getAttribute("class");
          return cls?.includes("accent-soft") ?? false;
        },
        { timeout: 3_000 },
      )
      .toBe(true);
  });
});
