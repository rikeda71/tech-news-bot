import { expect, test } from "@playwright/test";
import { waitForArticles } from "../helpers";

test.describe("author detail page smoke", () => {
  test("著者名クリックで著者詳細ページへ遷移し、著者プロファイルが表示される", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);

    // 著者リンクを持つカードを探す (title="<name> の記事一覧" ボタン)
    const authorBtn = page.locator("button[title*='の記事一覧']").first();
    await expect(authorBtn).toBeVisible({ timeout: 10_000 });

    // 著者名を取得しておく
    const authorTitle = (await authorBtn.getAttribute("title")) ?? "";
    const authorName = authorTitle.replace(" の記事一覧", "");

    await authorBtn.click();

    // URL が /author/* に変わる
    await expect(page).toHaveURL(/\/author\/.+/, { timeout: 5_000 });

    // 著者名が h1 見出しとして表示される
    await expect(page.locator("h1")).toContainText(authorName, { timeout: 10_000 });
  });

  test("著者詳細ページで記事一覧が表示される", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);

    const authorBtn = page.locator("button[title*='の記事一覧']").first();
    await authorBtn.click();

    await expect(page).toHaveURL(/\/author\/.+/, { timeout: 5_000 });

    // 記事件数テキストが表示される ("N 件の記事")
    await expect(page.getByText(/件の記事/).first()).toBeVisible({ timeout: 10_000 });

    // 記事カードが少なくとも 1 件表示される
    const articleCards = page.locator("[data-article-id]");
    await expect(articleCards.first()).toBeVisible({ timeout: 10_000 });
  });

  test("著者詳細ページから一覧に戻れる", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);

    const authorBtn = page.locator("button[title*='の記事一覧']").first();
    await authorBtn.click();

    await expect(page).toHaveURL(/\/author\/.+/, { timeout: 5_000 });

    // 「← 一覧に戻る」ボタンをクリック
    await page.getByRole("button", { name: /一覧に戻る/ }).click();
    await expect(page).toHaveURL("/");

    // トップに戻ると記事一覧が表示される
    await waitForArticles(page);
  });
});
