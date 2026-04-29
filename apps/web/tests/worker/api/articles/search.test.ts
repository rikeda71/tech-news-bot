import { beforeEach, describe, it, expect } from "vite-plus/test";
import { SELF } from "cloudflare:test";
import { insertSampleArticles } from "../../../fixtures/articles";

beforeEach(async () => {
  await insertSampleArticles();
});

describe("GET /api/articles/search", () => {
  // beforeEach で挿入される記事:
  //   g-bt-1  title="BigTech Article One"  summary="Discusses LLM optimization"
  //   o-ai-1  title="AI Article One"       summary="Discusses GPT"
  //   o-ai-2  title="AI Article Two"       summary="Discusses DALL-E"

  it("returns 400 when q is missing", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search");
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toBe("missing q");
  });

  it("returns 400 when q is empty string", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=");
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toBe("missing q");
  });

  it("returns 400 when q has more than 5 tokens", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=a+b+c+d+e+f");
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toMatch(/token/);
  });

  it("returns 400 when a token exceeds 50 characters", async () => {
    const longToken = "a".repeat(51);
    const res = await SELF.fetch(`https://example.com/api/articles/search?q=${longToken}`);
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toMatch(/token/);
  });

  it("returns 400 when limit=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=ai&limit=0");
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit=101", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=ai&limit=101");
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toMatch(/limit/);
  });

  it("returns 400 when cursor is malformed", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/search?q=ai&cursor=not-valid-base64!!!",
    );
    expect.soft(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toMatch(/cursor/);
  });

  it("returns 200 with query/tokens/articles/next_cursor fields", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=article");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{
      query: string;
      tokens: string[];
      articles: unknown[];
      next_cursor: string | null;
    }>();
    expect.soft(body.query).toBe("article");
    expect.soft(body.tokens).toEqual(["article"]);
    expect.soft(Array.isArray(body.articles)).toBe(true);
    expect.soft("next_cursor" in body).toBe(true);
  });

  it("matches articles whose title contains the keyword (case-insensitive)", async () => {
    // "bigtech" は g-bt-1 の title に含まれる
    const res = await SELF.fetch("https://example.com/api/articles/search?q=bigtech");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ articles: { guid: string }[] }>();
    expect.soft(body.articles.some((a) => a.guid === "g-bt-1")).toBe(true);
    // ai 記事は含まれない
    expect.soft(body.articles.every((a) => a.guid !== "o-ai-1")).toBe(true);
  });

  it("matches articles whose summary contains the keyword", async () => {
    // "gpt" は o-ai-1 の summary に含まれる
    const res = await SELF.fetch("https://example.com/api/articles/search?q=gpt");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ articles: { guid: string }[] }>();
    expect.soft(body.articles.some((a) => a.guid === "o-ai-1")).toBe(true);
    // g-bt-1 や o-ai-2 は含まれない
    expect.soft(body.articles.every((a) => a.guid !== "g-bt-1")).toBe(true);
    expect.soft(body.articles.every((a) => a.guid !== "o-ai-2")).toBe(true);
  });

  it("is case-insensitive (uppercase keyword matches lowercase content)", async () => {
    // "DALL-E" → lowercase "dall-e" で o-ai-2 の summary "Discusses DALL-E" にマッチ
    const res = await SELF.fetch("https://example.com/api/articles/search?q=DALL-E");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ articles: { guid: string }[] }>();
    expect.soft(body.articles.some((a) => a.guid === "o-ai-2")).toBe(true);
  });

  it("applies AND logic: both tokens must match", async () => {
    // "ai" は全 ai 記事に, "gpt" は o-ai-1 にのみマッチ → AND で o-ai-1 のみ
    const res = await SELF.fetch("https://example.com/api/articles/search?q=ai+gpt");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ articles: { guid: string }[] }>();
    expect.soft(body.articles.some((a) => a.guid === "o-ai-1")).toBe(true);
    // o-ai-2 は "gpt" を含まない
    expect.soft(body.articles.every((a) => a.guid !== "o-ai-2")).toBe(true);
  });

  it("returns empty articles when no articles match", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=xxxxxxxxnotexist");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ articles: unknown[] }>();
    expect.soft(body.articles).toEqual([]);
  });

  it("returns results in published_at DESC, id DESC order", async () => {
    // "article" は全 3 件の title に含まれる
    const res = await SELF.fetch("https://example.com/api/articles/search?q=article");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ articles: { published_at: string }[] }>();
    const dates = body.articles.map((a) => a.published_at);
    const sorted = dates.toSorted((a, b) => b.localeCompare(a));
    expect.soft(dates).toEqual(sorted);
  });

  it("paginates with cursor: first page + second page covers all articles", async () => {
    // "article" が全 3 件にマッチ。limit=2 でページネーション確認
    const res1 = await SELF.fetch("https://example.com/api/articles/search?q=article&limit=2");
    expect.soft(res1.status).toBe(200);
    const body1 = await res1.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect(body1.articles.length).toBe(2);
    expect(body1.next_cursor).not.toBeNull();

    const res2 = await SELF.fetch(
      `https://example.com/api/articles/search?q=article&limit=2&cursor=${body1.next_cursor}`,
    );
    expect.soft(res2.status).toBe(200);
    const body2 = await res2.json<{
      articles: { guid: string }[];
      next_cursor: string | null;
    }>();
    expect.soft(body2.articles.length).toBe(1);
    expect.soft(body2.next_cursor).toBeNull();

    const allGuids = [...body1.articles.map((a) => a.guid), ...body2.articles.map((a) => a.guid)];
    expect.soft(allGuids).toContain("g-bt-1");
    expect.soft(allGuids).toContain("o-ai-1");
    expect.soft(allGuids).toContain("o-ai-2");
  });

  it("returns Cache-Control: public, max-age=120", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=ai");
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Cache-Control")).toBe("public, max-age=120");
  });

  it("returns Content-Type: application/json", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/search?q=ai");
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toMatch(/application\/json/);
  });
});
