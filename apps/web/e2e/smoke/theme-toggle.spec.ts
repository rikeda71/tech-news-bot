import { expect, test } from "@playwright/test";

test.describe("theme toggle", () => {
  test("dark mode ボタンで data-theme=dark が html に付く", async ({ page }) => {
    await page.goto("/");

    // ダークモードボタンをクリック
    await page.getByRole("button", { name: "ダークモード" }).click();

    // html 要素に data-theme="dark" が付く
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("light mode ボタンで data-theme=light が html に付く", async ({ page }) => {
    await page.goto("/");

    // ライトモードボタンをクリック
    await page.getByRole("button", { name: "ライトモード" }).click();

    // html 要素に data-theme="light" が付く
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  });
});
