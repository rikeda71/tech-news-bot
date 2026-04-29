import { beforeEach, describe, it, expect } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../../worker/db/articles";
import { insertSampleArticles } from "../../../fixtures/articles";

beforeEach(async () => {
  await insertSampleArticles();
});

describe("GET /api/articles/by-feed/:feedId", () => {
  it("returns 200 with articles for a known feedId", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/openai-blog");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { feed_id: string }[]; next_cursor: string | null }>();
    expect(Array.isArray(body.articles)).toBe(true);
    expect(body.articles.length).toBe(2);
    for (const article of body.articles) {
      expect(article.feed_id).toBe("openai-blog");
    }
    expect(body.next_cursor).toBeNull();
  });

  it("returns 200 with empty array when feedId has no articles", async () => {
    // 存在しない feed_id を指定 → 0 件で 200
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/nonexistent-feed-xyz");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: unknown[]; next_cursor: string | null }>();
    expect(body.articles).toEqual([]);
    expect(body.next_cursor).toBeNull();
  });

  it("returns 400 when feedId is empty", async () => {
    // Hono のルートでは /by-feed/ は別セグメントとして扱われないため
    // 空文字チェックは URL decode 後に行う
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/%20");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/feedId/);
  });

  it("returns 400 when limit=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/openai-blog?limit=0");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit=51", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/openai-blog?limit=51");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit is non-numeric", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/openai-blog?limit=abc");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when cursor is malformed", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/by-feed/openai-blog?cursor=not-valid-base64!!!",
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/cursor/);
  });

  it("returns articles in published_at DESC, id DESC order", async () => {
    // openai-blog に同一 published_at の記事を追加して tie-break を確認
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
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/openai-blog");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { published_at: string; id: number }[] }>();
    const dates = body.articles.map((a) => a.published_at);
    const sorted = dates.toSorted((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
    // 同一 published_at 内は id DESC
    const sameAt = body.articles.filter((a) => a.published_at === SAME_AT);
    if (sameAt.length >= 2) {
      expect(sameAt[0].id).toBeGreaterThan(sameAt[1].id);
    }
  });

  it("paginates with cursor: first page + second page covers all articles", async () => {
    // openai-blog に追加で 2 件挿入して合計 4 件にする
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
    const res1 = await SELF.fetch("https://example.com/api/articles/by-feed/openai-blog?limit=2");
    expect(res1.status).toBe(200);
    const body1 = await res1.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect(body1.articles.length).toBe(2);
    expect(body1.next_cursor).not.toBeNull();

    // 2 ページ目: cursor を使用
    const res2 = await SELF.fetch(
      `https://example.com/api/articles/by-feed/openai-blog?limit=2&cursor=${body1.next_cursor}`,
    );
    expect(res2.status).toBe(200);
    const body2 = await res2.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect(body2.articles.length).toBe(2);
    expect(body2.next_cursor).toBeNull();

    // 2 ページ合わせて全 guid が揃う
    const allGuids = [...body1.articles.map((a) => a.guid), ...body2.articles.map((a) => a.guid)];
    expect(allGuids).toContain("o-ai-1");
    expect(allGuids).toContain("o-ai-2");
    expect(allGuids).toContain("o-page-1");
    expect(allGuids).toContain("o-page-2");
  });

  it("does not mix articles from different feed_id", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/google-research");
    expect(res.status).toBe(200);
    const body = await res.json<{ articles: { feed_id: string }[] }>();
    for (const article of body.articles) {
      expect(article.feed_id).toBe("google-research");
    }
  });

  it("returns Cache-Control: public, max-age=300", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-feed/openai-blog");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });
});
