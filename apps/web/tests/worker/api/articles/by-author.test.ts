import { beforeEach, describe, it, expect } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../../worker/db/articles";
import { insertSampleArticles } from "../../../fixtures/articles";

beforeEach(async () => {
  await insertSampleArticles();
});

describe("GET /api/articles/by-author/:author", () => {
  it("returns 200 with articles for a known author", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/Author%20A");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { author: string }[]; next_cursor: string | null }>();
    expect(Array.isArray(body.articles)).toBe(true);
    expect(body.articles.length).toBe(1);
    expect(body.articles[0].author).toBe("Author A");
    expect(body.next_cursor).toBeNull();
  });

  it("returns 200 with empty array when author has no articles", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/NonExistentAuthor");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: unknown[]; next_cursor: string | null }>();
    expect(body.articles).toEqual([]);
    expect(body.next_cursor).toBeNull();
  });

  it("returns 400 when limit=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/Author%20A?limit=0");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit=51", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/Author%20A?limit=51");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit is non-numeric", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/Author%20A?limit=abc");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when cursor is malformed", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/by-author/Author%20A?cursor=not-valid-base64!!!",
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/cursor/);
  });

  it("decodes URL-encoded author name (space)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/Author%20A");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { author: string }[] }>();
    expect(body.articles.length).toBeGreaterThan(0);
    expect(body.articles[0].author).toBe("Author A");
  });

  it("returns articles in published_at DESC order", async () => {
    // Author B に 2 件目を追加して順序確認
    await insertArticles(env.DB, [
      {
        guid: "o-ai-10",
        feed_id: "openai-blog",
        title: "Author B Older",
        url: "https://x.test/o/10",
        summary: null,
        author: "Author B",
        published_at: "2024-03-01T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);
    const res = await SELF.fetch("https://example.com/api/articles/by-author/Author%20B");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { published_at: string }[] }>();
    expect(body.articles.length).toBe(2);
    // published_at DESC: 2024-04-02 が先
    expect(body.articles[0].published_at > body.articles[1].published_at).toBe(true);
  });

  it("paginates with cursor: first page + second page", async () => {
    // Author C に追加で 2 件挿入して合計 3 件にする
    await insertArticles(env.DB, [
      {
        guid: "o-ai-11",
        feed_id: "openai-blog",
        title: "Author C Second",
        url: "https://x.test/o/11",
        summary: null,
        author: "Author C",
        published_at: "2024-04-02T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
      {
        guid: "o-ai-12",
        feed_id: "openai-blog",
        title: "Author C Third",
        url: "https://x.test/o/12",
        summary: null,
        author: "Author C",
        published_at: "2024-04-01T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);

    // 1 ページ目: limit=2
    const res1 = await SELF.fetch("https://example.com/api/articles/by-author/Author%20C?limit=2");
    expect(res1.status).toBe(200);
    const body1 = await res1.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect(body1.articles.length).toBe(2);
    expect(body1.next_cursor).not.toBeNull();

    // 2 ページ目: cursor を使用
    const res2 = await SELF.fetch(
      `https://example.com/api/articles/by-author/Author%20C?limit=2&cursor=${body1.next_cursor}`,
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect(body2.articles.length).toBe(1);
    expect(body2.next_cursor).toBeNull();

    // 2 ページ合わせて全 guid が揃うことを確認
    const allGuids = [...body1.articles.map((a) => a.guid), ...body2.articles.map((a) => a.guid)];
    expect(allGuids).toContain("o-ai-2");
    expect(allGuids).toContain("o-ai-11");
    expect(allGuids).toContain("o-ai-12");
  });

  it("returns Cache-Control: public, max-age=300", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/Author%20A");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });
});
