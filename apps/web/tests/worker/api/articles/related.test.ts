import { beforeEach, describe, it, expect } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../../worker/db/articles";
import { syncFeeds } from "../../../../worker/db/feeds";
import type { Article, FeedConfig } from "../../../../worker/types";
import { insertSampleArticles } from "../../../fixtures/articles";

beforeEach(async () => {
  await insertSampleArticles();
});

describe("GET /api/articles/:guid/related", () => {
  it("returns 404 for unknown guid", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/unknown-guid-does-not-exist/related",
    );
    expect(res.status).toBe(404);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("not found");
  });

  it("returns 400 when n=0", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/related?n=0");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("n must be 1-20");
  });

  it("returns 400 when n=21", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/related?n=21");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("n must be 1-20");
  });

  it("returns same feed articles when enough exist", async () => {
    // openai-blog に記事を追加して同 feed の記事を 5 件以上にする
    const extraFeeds: FeedConfig[] = [
      {
        id: "openai-blog",
        name: "OpenAI Blog",
        url: "https://x.test/o",
        category: "ai",
        lang: "en",
        enabled: true,
      },
    ];
    await syncFeeds(env.DB, extraFeeds);
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
      {
        guid: "o-ai-4",
        feed_id: "openai-blog",
        title: "AI Article Four",
        url: "https://x.test/o/4",
        summary: null,
        author: null,
        published_at: "2024-04-05T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
      {
        guid: "o-ai-5",
        feed_id: "openai-blog",
        title: "AI Article Five",
        url: "https://x.test/o/5",
        summary: null,
        author: null,
        published_at: "2024-04-06T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
      {
        guid: "o-ai-6",
        feed_id: "openai-blog",
        title: "AI Article Six",
        url: "https://x.test/o/6",
        summary: null,
        author: null,
        published_at: "2024-04-07T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);

    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/related?n=5");
    expect(res.status).toBe(200);
    const body = await res.json<{ items: Article[] }>();
    expect(body.items.length).toBe(5);
    for (const item of body.items) {
      expect(item.feed_id).toBe("openai-blog");
    }
  });

  it("fills remaining slots with same category articles from other feeds", async () => {
    // google-research に bigtech 記事を追加し、bigtech の別 feed を用意
    const moreFeeds: FeedConfig[] = [
      {
        id: "meta-engineering",
        name: "Meta Engineering",
        url: "https://x.test/m",
        category: "bigtech",
        lang: "en",
        enabled: true,
      },
    ];
    await syncFeeds(env.DB, moreFeeds);
    // google-research には既に g-bt-1 が入っている (beforeEach)
    await insertArticles(env.DB, [
      {
        guid: "g-bt-2",
        feed_id: "google-research",
        title: "BigTech Article Two",
        url: "https://x.test/g/2",
        summary: null,
        author: null,
        published_at: "2024-04-02T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "m-bt-1",
        feed_id: "meta-engineering",
        title: "Meta Article One",
        url: "https://x.test/m/1",
        summary: null,
        author: null,
        published_at: "2024-04-01T12:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "m-bt-2",
        feed_id: "meta-engineering",
        title: "Meta Article Two",
        url: "https://x.test/m/2",
        summary: null,
        author: null,
        published_at: "2024-04-02T12:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "m-bt-3",
        feed_id: "meta-engineering",
        title: "Meta Article Three",
        url: "https://x.test/m/3",
        summary: null,
        author: null,
        published_at: "2024-04-03T12:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "m-bt-4",
        feed_id: "meta-engineering",
        title: "Meta Article Four",
        url: "https://x.test/m/4",
        summary: null,
        author: null,
        published_at: "2024-04-04T12:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "m-bt-5",
        feed_id: "meta-engineering",
        title: "Meta Article Five",
        url: "https://x.test/m/5",
        summary: null,
        author: null,
        published_at: "2024-04-05T12:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
    ]);

    // g-bt-1 の関連記事を n=5 で取得
    // 同 feed (google-research) には g-bt-2 の 1 件、残り 4 件は meta-engineering から
    const res = await SELF.fetch("https://example.com/api/articles/g-bt-1/related?n=5");
    expect(res.status).toBe(200);
    const body = await res.json<{ items: Article[] }>();
    expect(body.items.length).toBe(5);

    // 先頭が同 feed
    expect(body.items[0].feed_id).toBe("google-research");
    // 残りは meta-engineering (同 category)
    for (const item of body.items.slice(1)) {
      expect(item.feed_id).toBe("meta-engineering");
      expect(item.category).toBe("bigtech");
    }
  });

  it("does not include the target article itself in items", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/related");
    expect(res.status).toBe(200);
    const body = await res.json<{ items: Article[] }>();
    for (const item of body.items) {
      expect(item.guid).not.toBe("o-ai-1");
    }
  });

  it("returns items sorted by published_at desc within each segment", async () => {
    // openai-blog に記事を追加して published_at の順序を確認
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

    // o-ai-1 の関連: o-ai-3 (2024-04-04) → o-ai-2 (2024-04-03) の順
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/related?n=5");
    expect(res.status).toBe(200);
    const body = await res.json<{ items: Article[] }>();
    const sameFeed = body.items.filter((i) => i.feed_id === "openai-blog");
    expect(sameFeed.length).toBeGreaterThanOrEqual(2);
    expect(sameFeed[0].published_at >= sameFeed[1].published_at).toBe(true);
  });

  it("returns Content-Type application/json", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/related");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/application\/json/);
  });

  it("returns Cache-Control with max-age=300", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/o-ai-1/related");
    expect(res.status).toBe(200);
    const cc = res.headers.get("Cache-Control");
    expect(cc).toContain("max-age=300");
  });
});
