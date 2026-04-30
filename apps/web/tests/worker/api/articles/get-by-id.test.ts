import { beforeEach, describe, it, expect } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertSampleArticles } from "../../../fixtures/articles";

beforeEach(async () => {
  await insertSampleArticles();
});

describe("GET /api/articles/:id", () => {
  it("returns 200 with full article fields for existing article", async () => {
    // 挿入した記事の id を D1 から取得
    const row = await env.DB.prepare("SELECT id FROM articles WHERE guid = ?1")
      .bind("g-bt-1")
      .first<{ id: number }>();
    const id = row?.id;

    const res = await SELF.fetch(`https://example.com/api/articles/${id}`);
    expect.soft(res.status).toBe(200);

    const body = await res.json<{
      id: number;
      guid: string;
      feed_id: string;
      feed_name: string | null;
      title: string;
      url: string;
      summary: string | null;
      author: string | null;
      published_at: string;
      fetched_at: string;
      category: string;
      lang: string;
    }>();
    expect.soft(body.id).toBe(id);
    expect.soft(body.guid).toBe("g-bt-1");
    expect.soft(body.feed_id).toBe("google-research");
    expect.soft(body.title).toBe("BigTech Article One");
    expect.soft(body.url).toBe("https://x.test/g/1");
    expect.soft(body.category).toBe("bigtech");
    expect.soft(body.lang).toBe("en");
    expect.soft(typeof body.fetched_at).toBe("string");
  });

  it("returns 404 for non-existent id", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/99999999");
    expect.soft(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toBe("not found");
  });

  it("returns 400 for non-integer id", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/abc");
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toBe("invalid id");
  });

  it("returns 304 when If-None-Match matches ETag", async () => {
    const row = await env.DB.prepare("SELECT id FROM articles WHERE guid = ?1")
      .bind("g-bt-1")
      .first<{ id: number }>();
    const id = row?.id;

    // 1回目のリクエストで ETag を取得。etag は後続リクエストの前提のため fail-fast
    const res1 = await SELF.fetch(`https://example.com/api/articles/${id}`);
    expect(res1.status).toBe(200);
    const etag = res1.headers.get("ETag");
    expect(etag).not.toBeNull();

    // 2回目は If-None-Match を付けて 304 を期待
    const res2 = await SELF.fetch(`https://example.com/api/articles/${id}`, {
      headers: { "If-None-Match": etag! },
    });
    expect(res2.status).toBe(304);
  });

  it("returns Content-Type application/json for 200 response", async () => {
    const row = await env.DB.prepare("SELECT id FROM articles WHERE guid = ?1")
      .bind("g-bt-1")
      .first<{ id: number }>();
    const id = row?.id;

    const res = await SELF.fetch(`https://example.com/api/articles/${id}`);
    expect.soft(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type");
    expect.soft(contentType).toMatch(/application\/json/);
  });
});
