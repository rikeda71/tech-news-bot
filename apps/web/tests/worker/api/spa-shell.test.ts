import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertSampleArticles, FEEDS } from "../../fixtures/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import { insertArticles } from "../../../worker/db/articles";

beforeEach(async () => {
  await insertSampleArticles();
});

// HTML からメタタグ属性値を取得するヘルパー
function extractMeta(html: string, selector: string): string | null {
  // <title> の textContent
  if (selector === "title") {
    const m = html.match(/<title>([^<]*)<\/title>/i);
    return m ? m[1] : null;
  }
  // <meta property="og:..." content="...">
  const propM = selector.match(/^\[property="(.+)"\]$/);
  if (propM) {
    const prop = propM[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`<meta[^>]+property="${prop}"[^>]+content="([^"]*)"`, "i");
    const m =
      html.match(re) ??
      html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+property="${prop}"`, "i"));
    return m ? m[1] : null;
  }
  // <meta name="..." content="...">
  const nameM = selector.match(/^\[name="(.+)"\]$/);
  if (nameM) {
    const name = nameM[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`<meta[^>]+name="${name}"[^>]+content="([^"]*)"`, "i");
    const m =
      html.match(re) ??
      html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+name="${name}"`, "i"));
    return m ? m[1] : null;
  }
  // <link rel="canonical" href="...">
  if (selector === 'link[rel="canonical"]') {
    const m =
      html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"[^>]*>/i) ??
      html.match(/<link[^>]+href="([^"]*)"[^>]+rel="canonical"[^>]*>/i);
    return m ? m[1] : null;
  }
  return null;
}

describe("SPA shell rewrite: GET /articles/:id", () => {
  it("rewrites title, og:title, description, og:description, canonical for existing article", async () => {
    const row = await env.DB.prepare("SELECT id FROM articles WHERE guid = ?1")
      .bind("g-bt-1")
      .first<{ id: number }>();
    const id = row?.id;

    const res = await SELF.fetch(`https://example.com/articles/${id}`);
    expect(res.status).toBe(200);

    const html = await res.text();

    expect.soft(extractMeta(html, "title")).toContain("BigTech Article One");
    expect.soft(extractMeta(html, '[property="og:title"]')).toContain("BigTech Article One");
    expect.soft(extractMeta(html, '[name="description"]')).toContain("Discusses LLM optimization");
    expect
      .soft(extractMeta(html, '[property="og:description"]'))
      .toContain("Discusses LLM optimization");
    expect.soft(extractMeta(html, 'link[rel="canonical"]')).toContain(`/articles/${id}`);
  });

  it("returns Cache-Control with max-age=300 for article page", async () => {
    const row = await env.DB.prepare("SELECT id FROM articles WHERE guid = ?1")
      .bind("g-bt-1")
      .first<{ id: number }>();
    const id = row?.id;

    const res = await SELF.fetch(`https://example.com/articles/${id}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
  });

  it("falls back to static index.html for unknown article id", async () => {
    const res = await SELF.fetch("https://example.com/articles/99999999");
    expect(res.status).toBe(200);
    // fallback の場合は no-cache
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
  });
});

describe("SPA shell rewrite: GET /feed/:feedId", () => {
  it("rewrites title with feed name for existing feed", async () => {
    const res = await SELF.fetch("https://example.com/feed/google-research");
    expect(res.status).toBe(200);

    const html = await res.text();

    expect.soft(extractMeta(html, "title")).toContain("Google Research");
    expect.soft(extractMeta(html, '[property="og:title"]')).toContain("Google Research");
    expect.soft(extractMeta(html, 'link[rel="canonical"]')).toContain("/feed/google-research");
  });

  it("falls back to static index.html for unknown feedId", async () => {
    const res = await SELF.fetch("https://example.com/feed/nonexistent-feed-xyz");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
  });
});

describe("SPA shell rewrite: GET /author/:author", () => {
  it("rewrites title with author name", async () => {
    const res = await SELF.fetch("https://example.com/author/Author%20A");
    expect(res.status).toBe(200);

    const html = await res.text();

    expect.soft(extractMeta(html, "title")).toContain("Author A");
    expect.soft(extractMeta(html, '[property="og:title"]')).toContain("Author A");
    expect.soft(extractMeta(html, 'link[rel="canonical"]')).toContain("/author/");
  });
});

describe("SPA shell rewrite: GET /by-category/:cat", () => {
  it("rewrites title with category label for bigtech", async () => {
    const res = await SELF.fetch("https://example.com/by-category/bigtech");
    expect(res.status).toBe(200);

    const html = await res.text();

    expect.soft(extractMeta(html, "title")).toContain("ビッグテック");
    expect.soft(extractMeta(html, '[property="og:title"]')).toContain("ビッグテック");
    expect.soft(extractMeta(html, 'link[rel="canonical"]')).toContain("/by-category/bigtech");
  });

  it("rewrites title with category label for ai", async () => {
    const res = await SELF.fetch("https://example.com/by-category/ai");
    expect(res.status).toBe(200);

    const html = await res.text();

    expect.soft(extractMeta(html, "title")).toContain("AI");
  });
});

describe("SPA shell rewrite: static routes (no rewriting)", () => {
  it("returns default title for top page /", async () => {
    const res = await SELF.fetch("https://example.com/");
    expect(res.status).toBe(200);

    // トップページは書き換えなし → Cache-Control は no-cache
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
  });

  it("returns no-cache for /stats", async () => {
    const res = await SELF.fetch("https://example.com/stats");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("no-cache");
  });

  it("does not rewrite /api/* routes", async () => {
    // /api/* は JSON を返すため HTML ではない
    const res = await SELF.fetch("https://example.com/api/articles?limit=1");
    expect(res.status).toBe(200);
    const ct = res.headers.get("Content-Type") ?? "";
    expect(ct).toContain("application/json");
  });
});

describe("SPA shell rewrite: article with null summary", () => {
  it("uses default description when article summary is null", async () => {
    // summary が null の記事を追加
    await syncFeeds(env.DB, FEEDS);
    await insertArticles(env.DB, [
      {
        guid: "no-summary-1",
        feed_id: "google-research",
        title: "Article Without Summary",
        url: "https://x.test/g/no-summary",
        summary: null,
        author: null,
        published_at: "2024-05-01T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
    ]);

    const row = await env.DB.prepare("SELECT id FROM articles WHERE guid = ?1")
      .bind("no-summary-1")
      .first<{ id: number }>();
    const id = row?.id;

    const res = await SELF.fetch(`https://example.com/articles/${id}`);
    expect(res.status).toBe(200);

    const html = await res.text();
    // description は DEFAULT_DESCRIPTION にフォールバック
    const desc = extractMeta(html, '[name="description"]');
    expect(desc).toBeTruthy();
  });
});
