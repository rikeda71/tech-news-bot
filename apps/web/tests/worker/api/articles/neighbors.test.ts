import { beforeEach, describe, it, expect } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../../worker/db/articles";
import type { Article } from "../../../../worker/types";
import { insertSampleArticles } from "../../../fixtures/articles";

beforeEach(async () => {
  await insertSampleArticles();
});

describe("GET /api/articles/:guid/neighbors", () => {
  // beforeEach で挿入される記事:
  //   g-bt-1 (google-research, 2024-04-01)
  //   o-ai-1 (openai-blog,     2024-04-02)
  //   o-ai-2 (openai-blog,     2024-04-03)

  it("returns 404 for unknown guid", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/unknown-guid-xyz/neighbors");
    expect.soft(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect.soft(body.error).toBe("not found");
  });

  it("returns prev and next both non-null for a middle article", async () => {
    // openai-blog: o-ai-1 (04-02) < o-ai-2 (04-03) < o-ai-3 (04-04)
    await insertArticles(env.DB, [
      {
        guid: "o-ai-3",
        feed_id: "openai-blog",
        title: "AI Article Three",
        url: "https://x.test/o/3",
        summary: null,
        author: null,
        published_at: "2024-04-04T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/o-ai-2/neighbors");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ prev: Article; next: Article }>();
    // prev/next の null チェックは .guid アクセスの前提のため fail-fast
    expect(body.prev).not.toBeNull();
    expect(body.next).not.toBeNull();
    expect.soft(body.prev.guid).toBe("o-ai-1");
    expect.soft(body.next.guid).toBe("o-ai-3");
  });

  it("returns prev=null for the oldest article in feed", async () => {
    // o-ai-1 は openai-blog で最も古い
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/neighbors");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ prev: Article | null; next: Article | null }>();
    expect.soft(body.prev).toBeNull();
    // next not null チェックは next!.guid アクセスの前提のため fail-fast
    expect(body.next).not.toBeNull();
    expect.soft(body.next!.guid).toBe("o-ai-2");
  });

  it("returns next=null for the newest article in feed", async () => {
    // o-ai-2 は openai-blog で最も新しい
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-2/neighbors");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ prev: Article | null; next: Article | null }>();
    expect.soft(body.next).toBeNull();
    // prev not null チェックは prev!.guid アクセスの前提のため fail-fast
    expect(body.prev).not.toBeNull();
    expect.soft(body.prev!.guid).toBe("o-ai-1");
  });

  it("tie-breaks by guid lexicographic order when published_at is identical", async () => {
    // 同一 published_at の記事を 3 件追加 (guid: tie-a, tie-b, tie-c)
    // 辞書順: tie-a < tie-b < tie-c → tie-b の prev=tie-a, next=tie-c
    const TIE_AT = "2024-05-01T00:00:00.000Z";
    await insertArticles(env.DB, [
      {
        guid: "tie-a",
        feed_id: "openai-blog",
        title: "Tie A",
        url: "https://x.test/o/tie-a",
        summary: null,
        author: null,
        published_at: TIE_AT,
        category: "ai",
        lang: "en",
      },
      {
        guid: "tie-b",
        feed_id: "openai-blog",
        title: "Tie B",
        url: "https://x.test/o/tie-b",
        summary: null,
        author: null,
        published_at: TIE_AT,
        category: "ai",
        lang: "en",
      },
      {
        guid: "tie-c",
        feed_id: "openai-blog",
        title: "Tie C",
        url: "https://x.test/o/tie-c",
        summary: null,
        author: null,
        published_at: TIE_AT,
        category: "ai",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/tie-b/neighbors");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ prev: Article; next: Article }>();
    // prev/next の .guid アクセスは型上 non-null なため直接 soft で検証
    expect.soft(body.prev.guid).toBe("tie-a");
    expect.soft(body.next.guid).toBe("tie-c");
  });

  it("does not return articles from a different feed", async () => {
    // g-bt-1 は google-research フィード。openai-blog 記事は neighbors に現れない
    const res = await SELF.fetch("https://example.com/api/articles/g-bt-1/neighbors");
    expect.soft(res.status).toBe(200);
    const body = await res.json<{ prev: Article | null; next: Article | null }>();
    // google-research には g-bt-1 のみなので両方 null
    expect.soft(body.prev).toBeNull();
    expect.soft(body.next).toBeNull();
  });

  it("returns Cache-Control: public, max-age=300", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/neighbors");
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Cache-Control")).toBe("public, max-age=300");
  });

  it("returns Content-Type: application/json", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/neighbors");
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toMatch(/application\/json/);
  });
});
