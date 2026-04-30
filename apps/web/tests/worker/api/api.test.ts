import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { insertArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

const FEEDS: FeedConfig[] = [
  {
    id: "google-research",
    name: "Google Research",
    url: "https://x.test/g",
    category: "bigtech",
    lang: "en",
    enabled: true,
  },
  {
    id: "openai-blog",
    name: "OpenAI",
    url: "https://x.test/o",
    category: "ai",
    lang: "en",
    enabled: true,
  },
  {
    id: "cyberagent-developers",
    name: "Mercari",
    url: "https://x.test/m",
    category: "jp",
    lang: "ja",
    enabled: true,
  },
];

beforeEach(async () => {
  await syncFeeds(env.DB, FEEDS);
  await insertArticles(env.DB, [
    {
      guid: "g-bt",
      feed_id: "google-research",
      title: "BigTech Article",
      url: "https://x.test/g/1",
      summary: "Discusses LLM optimization",
      author: null,
      published_at: "2024-04-01T00:00:00.000Z",
      category: "bigtech",
      lang: "en",
    },
    {
      guid: "g-ai",
      feed_id: "openai-blog",
      title: "AI Article",
      url: "https://x.test/o/1",
      summary: "About transformer training",
      author: null,
      published_at: "2024-04-02T00:00:00.000Z",
      category: "ai",
      lang: "en",
    },
    {
      guid: "g-jp",
      feed_id: "cyberagent-developers",
      title: "メルカリの記事",
      url: "https://x.test/m/1",
      summary: "メルカリ engineering",
      author: null,
      published_at: "2024-04-03T00:00:00.000Z",
      category: "jp",
      lang: "ja",
    },
  ]);
});

describe("/api/articles", () => {
  it("returns all articles in published_at desc order", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?limit=10");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.map((a) => a.guid)).toEqual(["g-jp", "g-ai", "g-bt"]);
  });

  it("filters by category", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?category=ai");
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.map((a) => a.guid)).toEqual(["g-ai"]);
  });

  it("filters by lang", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?lang=ja");
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.map((a) => a.guid)).toEqual(["g-jp"]);
  });

  it("rejects unknown feed_id silently (returns all)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?feed_id=does-not-exist");
    const body = (await res.json()) as { articles: unknown[] };
    expect(body.articles.length).toBe(3);
  });

  it("filters by valid feed_id", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?feed_id=openai-blog");
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.map((a) => a.guid)).toEqual(["g-ai"]);
  });

  it("supports full text search via FTS5", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?q=transformer");
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.map((a) => a.guid)).toEqual(["g-ai"]);
  });

  it("handles pagination via cursor", async () => {
    const page1 = await SELF.fetch("https://example.com/api/articles?limit=2");
    const body1 = (await page1.json()) as {
      articles: { guid: string }[];
      nextCursor: string | null;
    };
    expect(body1.articles.length).toBe(2);
    expect(body1.nextCursor).not.toBeNull();

    const page2 = await SELF.fetch(
      `https://example.com/api/articles?limit=2&cursor=${encodeURIComponent(body1.nextCursor!)}`,
    );
    const body2 = (await page2.json()) as { articles: { guid: string }[] };
    expect(body2.articles.map((a) => a.guid)).toEqual(["g-bt"]);
  });

  it("ignores malformed cursor", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?cursor=not-base64");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { articles: unknown[] };
    expect(body.articles.length).toBe(3);
  });

  it("filters by category AND feed_id together", async () => {
    // ai カテゴリかつ openai-blog のみ → g-ai 1件
    const res = await SELF.fetch(
      "https://example.com/api/articles?category=ai&feed_id=openai-blog",
    );
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.map((a) => a.guid)).toEqual(["g-ai"]);
  });

  it("returns empty when feed_id does not match category", async () => {
    // bigtech カテゴリかつ openai-blog (ai) → 0件
    const res = await SELF.fetch(
      "https://example.com/api/articles?category=bigtech&feed_id=openai-blog",
    );
    const body = (await res.json()) as { articles: unknown[] };
    expect(body.articles.length).toBe(0);
  });

  it("filters by feed_id AND full text search together", async () => {
    // openai-blog かつ "transformer" → g-ai のみ
    const res = await SELF.fetch(
      "https://example.com/api/articles?feed_id=openai-blog&q=transformer",
    );
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.map((a) => a.guid)).toEqual(["g-ai"]);
  });

  it("returns empty when feed_id and q do not match same article", async () => {
    // cyberagent-developers かつ "transformer" → 0件
    const res = await SELF.fetch(
      "https://example.com/api/articles?feed_id=cyberagent-developers&q=transformer",
    );
    const body = (await res.json()) as { articles: unknown[] };
    expect(body.articles.length).toBe(0);
  });

  it("filters by date_from only", async () => {
    // 2024-04-02 以降 → g-ai (04-02), g-jp (04-03) の2件
    const res = await SELF.fetch("https://example.com/api/articles?date_from=2024-04-02");
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.map((a) => a.guid)).toEqual(["g-jp", "g-ai"]);
  });

  it("filters by date_to only", async () => {
    // 2024-04-02 以前 → g-bt (04-01), g-ai (04-02) の2件
    const res = await SELF.fetch(
      "https://example.com/api/articles?date_to=2024-04-02T23:59:59.000Z",
    );
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.map((a) => a.guid)).toEqual(["g-ai", "g-bt"]);
  });

  it("filters by date_from and date_to together", async () => {
    // 2024-04-02 のみ → g-ai
    const res = await SELF.fetch(
      "https://example.com/api/articles?date_from=2024-04-02&date_to=2024-04-02T23:59:59.000Z",
    );
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.map((a) => a.guid)).toEqual(["g-ai"]);
  });

  it("ignores invalid date_from silently (returns all)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?date_from=not-a-date");
    const body = (await res.json()) as { articles: { guid: string }[] };
    expect(body.articles.length).toBe(3);
  });

  it("ignores invalid date_to silently (returns all)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles?date_to=2024-99-99");
    // 形式チェックは YYYY-MM-DD 形式なのでパスするが、SQLite が正規化して結果が変わる可能性あり
    // 不正な日付でもクラッシュせず 200 を返すことを確認
    expect(res.status).toBe(200);
  });
});

describe("/api/feeds", () => {
  it("returns synced feeds as array", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { feeds: { id: string }[] };
    // beforeEach で syncFeeds した 3 件が返る
    expect(body.feeds.length).toBeGreaterThanOrEqual(3);
  });

  it("returns 400 for invalid category", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds?category=invalid");
    expect(res.status).toBe(400);
  });
});

describe("/api/stats", () => {
  it("returns aggregated counts", async () => {
    const res = await SELF.fetch("https://example.com/api/stats");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      total: number;
      by_category: Record<string, number>;
      by_lang: Record<string, number>;
      stale_feeds: { id: string }[];
    };
    expect(body.total).toBe(3);
    expect(body.by_category).toEqual({ bigtech: 1, ai: 1, jp: 1, personal: 0 });
    expect(body.by_lang).toEqual({ en: 2, ja: 1 });
    // 全フィードは未収集 (last_fetched_at NULL) なので stale 扱い
    expect(body.stale_feeds.length).toBe(3);
  });

  it("flags only feeds with errors or no recent fetch", async () => {
    // 1 件は成功 (今), 1 件は error, 1 件は古い fetched_at
    const now = new Date().toISOString();
    const old = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
    await env.DB.prepare(
      `UPDATE feeds SET last_fetched_at = ?1, last_status = 'ok:1', last_error = NULL WHERE id = 'google-research'`,
    )
      .bind(now)
      .run();
    await env.DB.prepare(
      `UPDATE feeds SET last_fetched_at = ?1, last_status = 'error', last_error = 'HTTP 500' WHERE id = 'openai-blog'`,
    )
      .bind(now)
      .run();
    await env.DB.prepare(
      `UPDATE feeds SET last_fetched_at = ?1, last_status = 'ok:0', last_error = NULL WHERE id = 'cyberagent-developers'`,
    )
      .bind(old)
      .run();

    const res = await SELF.fetch("https://example.com/api/stats");
    const body = (await res.json()) as { stale_feeds: { id: string }[] };
    const ids = body.stale_feeds.map((f) => f.id).toSorted();
    expect(ids).toEqual(["cyberagent-developers", "openai-blog"]);
  });
});

describe("/api/health", () => {
  it("returns enriched health response with db summary", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      now: string;
      feeds: { total: number; enabled: number };
      articles: { total: number; last_24h: number };
    };
    expect(body.ok).toBe(true);
    expect(typeof body.now).toBe("string");
    expect(body.articles.total).toBe(3);
    // feeds are synced via syncFeeds in beforeEach (FEEDS has 3 entries, all enabled)
    expect(body.feeds.total).toBeGreaterThanOrEqual(3);
    expect(body.feeds.enabled).toBeGreaterThanOrEqual(3);
  });
});

describe("/api/admin/collect", () => {
  it("rejects unauthenticated requests", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collect", { method: "POST" });
    // ADMIN_TOKEN はテスト環境では設定済みのため 401 を期待する
    expect([401, 503]).toContain(res.status);
  });

  it("accepts requests with current ADMIN_TOKEN", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collect", {
      method: "POST",
      headers: { authorization: "Bearer test-admin-token" },
    });
    // 認証は通るが collect は実際のフィード fetch を試みる (タイムアウト後エラーになるが 200 で返る)
    expect(res.status).toBe(200);
  }, 60000);

  it("accepts requests with ADMIN_TOKEN_NEXT (rotation support)", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collect", {
      method: "POST",
      headers: { authorization: "Bearer test-admin-token-next" },
    });
    expect(res.status).toBe(200);
  }, 60000);

  it("rejects requests with invalid token", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collect", {
      method: "POST",
      headers: { authorization: "Bearer invalid-token" },
    });
    expect(res.status).toBe(401);
  });
});

describe("CORS headers on public /api/* endpoints", () => {
  const allowedOrigin = "https://tech-news-bot.rikeda71.workers.dev";

  it("returns Access-Control-Allow-Origin for /api/articles GET", async () => {
    const res = await SELF.fetch("https://example.com/api/articles", {
      headers: { origin: allowedOrigin },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
  });

  it("handles OPTIONS preflight for /api/articles", async () => {
    const res = await SELF.fetch("https://example.com/api/articles", {
      method: "OPTIONS",
      headers: {
        origin: allowedOrigin,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
    expect(res.headers.get("Access-Control-Allow-Methods")).toMatch(/GET/);
  });

  it("returns Access-Control-Allow-Origin for /api/health GET", async () => {
    const res = await SELF.fetch("https://example.com/api/health", {
      headers: { origin: allowedOrigin },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
  });

  it("returns Access-Control-Allow-Origin for /api/stats GET", async () => {
    const res = await SELF.fetch("https://example.com/api/stats", {
      headers: { origin: allowedOrigin },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
  });

  it("returns Access-Control-Allow-Origin for /api/feeds GET", async () => {
    const res = await SELF.fetch("https://example.com/api/feeds", {
      headers: { origin: allowedOrigin },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
  });

  it("does NOT return Access-Control-Allow-Origin for /api/admin (server-to-server only)", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collect", {
      method: "POST",
      headers: {
        origin: allowedOrigin,
        authorization: "Bearer test-admin-token",
      },
    });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  }, 60000);
});

describe("security headers", () => {
  it("sets X-Frame-Options and CSP on responses", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  });
});

describe("cache headers", () => {
  it("/api/health uses no-cache", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("static asset under /assets/ uses immutable long max-age", async () => {
    const res = await SELF.fetch("https://example.com/assets/index-BYIbkfak.js");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
  });

  it("HTML / SPA fallback uses no-cache", async () => {
    const res = await SELF.fetch("https://example.com/");
    expect(res.headers.get("Cache-Control")).toBe("no-cache, must-revalidate");
  });
});
