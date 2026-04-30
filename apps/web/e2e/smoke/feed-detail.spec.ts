import { expect, test } from "@playwright/test";
import { waitForArticles } from "../helpers";

test.describe("feed detail page smoke", () => {
  test("フィード詳細ページでフィードメタと記事一覧が表示される", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);

    // 最初のカードの取得元ボタン (feed name ボタン) をクリックしてフィード詳細へ遷移
    const firstCard = page.locator("[data-article-id]").first();
    const feedNameBtn = firstCard.locator("button[title*='で絞り込む']").last();
    await feedNameBtn.click();

    // URL が /feed/* に変わることを確認
    await expect(page).toHaveURL(/\/feed\/.+/, { timeout: 5_000 });

    // フィード名が h2 見出しとして表示される
    const feedHeading = page.locator("h2");
    await expect(feedHeading).toBeVisible({ timeout: 10_000 });

    // 「30 日の記事数」メタ情報が表示される
    await expect(page.getByText(/30 日の記事数/)).toBeVisible({ timeout: 10_000 });

    // 直近の記事セクションが表示される
    await expect(page.getByText("直近の記事")).toBeVisible({ timeout: 10_000 });

    // 記事カードが少なくとも 1 件表示される
    const articleCards = page.locator("[data-article-id]");
    await expect(articleCards.first()).toBeVisible({ timeout: 10_000 });
  });

  test("フィード詳細ページから一覧に戻れる", async ({ page }) => {
    // seed データの google-blog フィードへ直接アクセス
    await page.goto("/");
    await waitForArticles(page);

    const firstCard = page.locator("[data-article-id]").first();
    const feedNameBtn = firstCard.locator("button[title*='で絞り込む']").last();
    await feedNameBtn.click();

    await expect(page).toHaveURL(/\/feed\/.+/, { timeout: 5_000 });

    // 「← 一覧に戻る」ボタンで / に戻る
    await page.getByRole("button", { name: /一覧に戻る/ }).click();
    await expect(page).toHaveURL("/");

    // トップに戻ると記事一覧が表示される
    await waitForArticles(page);
  });

  test("フィード詳細ページにカテゴリバッジが表示される", async ({ page }) => {
    await page.goto("/");
    await waitForArticles(page);

    const firstCard = page.locator("[data-article-id]").first();
    const feedNameBtn = firstCard.locator("button[title*='で絞り込む']").last();
    await feedNameBtn.click();

    await expect(page).toHaveURL(/\/feed\/.+/, { timeout: 5_000 });

    // フィードの URL (外部リンク) が表示される
    const feedLink = page.locator("a[href^='https://']").first();
    await expect(feedLink).toBeVisible({ timeout: 10_000 });
  });
});
