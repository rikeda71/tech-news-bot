import { expect, test } from "@playwright/test";

test.describe("syndication endpoints", () => {
  test("/feed.json が JSON Feed として有効なレスポンスを返す", async ({ page }) => {
    const response = await page.request.get("/feed.json");

    // 200 OK
    expect(response.status()).toBe(200);

    // Content-Type が application/feed+json
    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toMatch(/application\/feed\+json/);

    // JSON としてパース可能で JSON Feed 必須フィールドを持つ
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.version).toBe("https://jsonfeed.org/version/1.1");
    expect(typeof body.title).toBe("string");
    expect(Array.isArray(body.items)).toBe(true);

    // seed データが存在するので少なくとも 1 件は返る
    const items = body.items as unknown[];
    expect(items.length).toBeGreaterThan(0);
  });

  test("/feed.xml が RSS 2.0 として有効なレスポンスを返す", async ({ page }) => {
    const response = await page.request.get("/feed.xml");

    // 200 OK
    expect(response.status()).toBe(200);

    // Content-Type が application/rss+xml
    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toMatch(/application\/rss\+xml/);

    // RSS 2.0 の必須要素を含む
    const text = await response.text();
    expect(text).toContain('<?xml version="1.0"');
    expect(text).toContain('<rss version="2.0"');
    expect(text).toContain("<channel>");
    expect(text).toContain("<title>");

    // seed データが存在するので少なくとも 1 件の <item> が返る
    expect(text).toContain("<item>");
  });

  test("/feed.atom が Atom 1.0 として有効なレスポンスを返す", async ({ page }) => {
    const response = await page.request.get("/feed.atom");

    // 200 OK
    expect(response.status()).toBe(200);

    // Content-Type が application/atom+xml
    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toMatch(/application\/atom\+xml/);

    // Atom 1.0 の必須要素を含む
    const text = await response.text();
    expect(text).toContain('xmlns="http://www.w3.org/2005/Atom"');
    expect(text).toContain("<title>");
    expect(text).toContain("<updated>");

    // seed データが存在するので少なくとも 1 件の <entry> が返る
    expect(text).toContain("<entry>");
  });

  test("カテゴリ別 JSON Feed (/feeds/category/ai.json) が有効なレスポンスを返す", async ({
    page,
  }) => {
    const response = await page.request.get("/feeds/category/ai.json");

    expect(response.status()).toBe(200);

    const contentType = response.headers()["content-type"] ?? "";
    expect(contentType).toMatch(/application\/feed\+json/);

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.version).toBe("https://jsonfeed.org/version/1.1");
    // タイトルに AI カテゴリを示す文字列が含まれる
    expect(body.title).toMatch(/AI/);
  });
});
