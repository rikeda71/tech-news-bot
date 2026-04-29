import type { Page } from "@playwright/test";

/**
 * ネットワークアイドル + 記事カードが最低 1 件表示されるまで待つ。
 * SPA が API レスポンスを受け取り描画完了するまで待機する。
 */
export async function waitForArticles(page: Page): Promise<void> {
  await page.waitForSelector("[data-article-id]", { timeout: 15_000 });
}

/**
 * ページ読み込み完了を待つ。API 未取得でも「読み込み中」表示が消えるまで待つ。
 */
export async function waitForPageReady(page: Page): Promise<void> {
  // ローディング表示が消えるまで待つ
  await page.waitForFunction(() => !document.querySelector("[data-testid='loading']"), {
    timeout: 10_000,
  });
}
