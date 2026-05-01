import { beforeEach, describe, it, expect } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../../worker/db/articles";
import { insertSampleArticles } from "../../../fixtures/articles";

beforeEach(async () => {
  await insertSampleArticles();
});

describe("GET /api/articles/by-category/:cat", () => {
  // beforeEach で挿入される記事:
  //   g-bt-1  (bigtech, 2024-04-01)
  //   o-ai-1  (ai,      2024-04-02)
  //   o-ai-2  (ai,      2024-04-03)

  it("returns 200 with articles for ai category", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-category/ai");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ articles: { category: string }[]; next_cursor: string | null }>();
    expect(Array.isArray(body.articles)).toBe(true);
    expect.soft(body.articles.length).toBe(2);
    for (const article of body.articles) {
      expect.soft(article.category).toBe("ai");
    }
    expect.soft(body.next_cursor).toBeNull();
  });

  it("returns 200 with empty array when category has no articles", async () => {
    // personal カテゴリの記事は beforeEach では挿入されない
    const res = await SELF.fetch("https://example.com/api/articles/by-category/personal");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ articles: unknown[]; next_cursor: string | null }>();
    expect.soft(body.articles).toEqual([]);
    expect.soft(body.next_cursor).toBeNull();
  });

  it("returns 400 for invalid category", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-category/foo");
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toMatch(/category/);
  });

  it("returns 400 when limit=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-category/ai?limit=0");
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit=51", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-category/ai?limit=51");
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit is non-numeric", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-category/ai?limit=abc");
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toMatch(/limit/);
  });

  it("returns 400 when cursor is malformed", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/by-category/ai?cursor=not-valid-base64!!!",
    );
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toMatch(/cursor/);
  });

  it("returns articles in published_at DESC, id DESC order", async () => {
    // ai カテゴリに同一 published_at の記事を追加して tie-break を確認
    const SAME_AT = "2024-04-03T00:00:00.000Z";
    await insertArticles(env.DB, [
      {
        guid: "o-ai-tie-1",
        feed_id: "openai-blog",
        title: "Tie 1",
        url: "https://x.test/o/tie1",
        summary: null,
        author: null,
        published_at: SAME_AT,
        category: "ai",
        lang: "en",
      },
    ]);
    // o-ai-2 も SAME_AT (2024-04-03) なので tie → id DESC が効く
    const res = await SELF.fetch("https://example.com/api/articles/by-category/ai");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ articles: { published_at: string; id: number }[] }>();
    const dates = body.articles.map((a) => a.published_at);
    const sorted = dates.toSorted((a, b) => b.localeCompare(a));
    expect.soft(dates).toEqual(sorted);
    // 同一 published_at 内は id DESC
    const sameAt = body.articles.filter((a) => a.published_at === SAME_AT);
    if (sameAt.length >= 2) {
      expect.soft(sameAt[0].id).toBeGreaterThan(sameAt[1].id);
    }
  });

  it("paginates with cursor: first page + second page covers all articles", async () => {
    // ai カテゴリに追加で 2 件挿入して合計 4 件にする
    await insertArticles(env.DB, [
      {
        guid: "o-page-1",
        feed_id: "openai-blog",
        title: "Page Article 1",
        url: "https://x.test/o/page1",
        summary: null,
        author: null,
        published_at: "2024-04-04T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
      {
        guid: "o-page-2",
        feed_id: "openai-blog",
        title: "Page Article 2",
        url: "https://x.test/o/page2",
        summary: null,
        author: null,
        published_at: "2024-04-05T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);

    // 1 ページ目: limit=2
    const res1 = await SELF.fetch("https://example.com/api/articles/by-category/ai?limit=2");
    expect.soft(res1.status).toBe(200);
    const body1 = await res1.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect(body1.articles.length).toBe(2);
    expect(body1.next_cursor).not.toBeNull();

    // 2 ページ目: cursor を使用
    const res2 = await SELF.fetch(
      `https://example.com/api/articles/by-category/ai?limit=2&cursor=${body1.next_cursor}`,
    );
    expect.soft(res2.status).toBe(200);
    const body2 = await res2.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect(body2.articles.length).toBe(2);
    expect.soft(body2.next_cursor).toBeNull();

    // 2 ページ合わせて全 guid が揃う
    const allGuids = [...body1.articles.map((a) => a.guid), ...body2.articles.map((a) => a.guid)];
    expect.soft(allGuids).toContain("o-ai-1");
    expect.soft(allGuids).toContain("o-ai-2");
    expect.soft(allGuids).toContain("o-page-1");
    expect.soft(allGuids).toContain("o-page-2");
  });

  it("does not mix articles from different categories", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-category/bigtech");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ articles: { category: string }[] }>();
    expect(body.articles.length).toBeGreaterThan(0);
    for (const article of body.articles) {
      expect.soft(article.category).toBe("bigtech");
    }
  });

  it("returns Cache-Control: public, max-age=300", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-category/ai");
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Cache-Control")).toContain("max-age=300");
  });
});
