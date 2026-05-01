import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import {
  recordFetchError,
  recordFetchSuccess,
  syncFeeds,
  updateFeedHeaders,
} from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

const AUTH_HEADER = { authorization: "Bearer test-admin-token" };

const FEED_A: FeedConfig = {
  id: "feed-alpha",
  name: "Feed Alpha",
  url: "https://example.com/alpha.xml",
  category: "bigtech",
  lang: "en",
  enabled: true,
};

const FEED_B: FeedConfig = {
  id: "feed-beta",
  name: "Feed Beta",
  url: "https://example.com/beta.xml",
  category: "ai",
  lang: "ja",
  enabled: false,
};

beforeEach(async () => {
  // setup.ts の beforeEach で reset + applyD1Migrations が実行される
});

describe("GET /api/admin/feeds/diagnostics", () => {
  it("401: token なし → 401", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/diagnostics");
    expect(res.status).toBe(401);
  });

  it("401: 不正 token → 401", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/diagnostics", {
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("200: 空 DB でも { feeds: [], count: 0 } を返す", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/diagnostics", {
      headers: AUTH_HEADER,
    });
    expect.soft(res.status).toBe(200);
    const body = (await res.json()) as { feeds: unknown[]; count: number };
    // Array.isArray は後続 toHaveLength の guard として fail-fast させる
    expect(Array.isArray(body.feeds)).toBe(true);
    expect.soft(body.feeds).toHaveLength(0);
    expect.soft(body.count).toBe(0);
  });

  it("200: Cache-Control が private, max-age=30", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/diagnostics", {
      headers: AUTH_HEADER,
    });
    expect.soft(res.status).toBe(200);
    const cc = res.headers.get("cache-control") ?? "";
    expect.soft(cc).toContain("private");
    expect.soft(cc).toContain("max-age=30");
  });

  it("200: enabled / disabled 両方のフィードが含まれる", async () => {
    await syncFeeds(env.DB, [FEED_A, FEED_B]);

    const res = await SELF.fetch("https://example.com/api/admin/feeds/diagnostics", {
      headers: AUTH_HEADER,
    });
    expect.soft(res.status).toBe(200);
    const body = (await res.json()) as {
      feeds: { id: string; enabled: boolean }[];
      count: number;
    };
    expect.soft(body.count).toBe(2);
    const ids = body.feeds.map((f) => f.id);
    expect.soft(ids).toContain("feed-alpha");
    expect.soft(ids).toContain("feed-beta");
    const alpha = body.feeds.find((f) => f.id === "feed-alpha");
    const beta = body.feeds.find((f) => f.id === "feed-beta");
    expect.soft(alpha!.enabled).toBe(true);
    expect.soft(beta!.enabled).toBe(false);
  });

  it("200: 各フィールドが正しく返る (last_fetched_at, last_etag, last_status, last_error)", async () => {
    await syncFeeds(env.DB, [FEED_A]);

    const fetchedAt = "2026-04-01T00:00:00.000Z";
    // 成功記録 + ETag/Last-Modified 更新
    await recordFetchSuccess(env.DB, "feed-alpha", fetchedAt, 5);
    await updateFeedHeaders(env.DB, "feed-alpha", "etag-abc", "Mon, 01 Apr 2026 00:00:00 GMT");

    const res = await SELF.fetch("https://example.com/api/admin/feeds/diagnostics", {
      headers: AUTH_HEADER,
    });
    expect.soft(res.status).toBe(200);
    const body = (await res.json()) as {
      feeds: {
        id: string;
        name: string;
        url: string;
        category: string;
        lang: string;
        enabled: boolean;
        last_fetched_at: string | null;
        last_status: string | null;
        last_error: string | null;
        last_etag: string | null;
        last_modified: string | null;
        fetch_error_count: number;
        articles_total: number;
        articles_30d: number;
        last_published_at: string | null;
      }[];
      count: number;
    };
    // count は feeds[0] アクセスのガードなので plain expect を使う
    expect(body.count).toBe(1);
    const f = body.feeds[0];
    expect.soft(f.id).toBe("feed-alpha");
    expect.soft(f.name).toBe("Feed Alpha");
    expect.soft(f.url).toBe("https://example.com/alpha.xml");
    expect.soft(f.category).toBe("bigtech");
    expect.soft(f.lang).toBe("en");
    expect.soft(f.enabled).toBe(true);
    expect.soft(f.last_fetched_at).toBe(fetchedAt);
    expect.soft(f.last_status).toBe("ok:5");
    expect.soft(f.last_error).toBeNull();
    expect.soft(f.last_etag).toBe("etag-abc");
    expect.soft(f.last_modified).toBe("Mon, 01 Apr 2026 00:00:00 GMT");
    expect.soft(f.fetch_error_count).toBe(0);
    expect.soft(f.articles_total).toBe(0); // articles は未挿入
    expect.soft(f.articles_30d).toBe(0);
    expect.soft(f.last_published_at).toBeNull();
  });

  it("200: エラー後は last_error / fetch_error_count が反映される", async () => {
    await syncFeeds(env.DB, [FEED_A]);

    const fetchedAt = "2026-04-02T00:00:00.000Z";
    await recordFetchError(env.DB, "feed-alpha", fetchedAt, "connection refused");

    const res = await SELF.fetch("https://example.com/api/admin/feeds/diagnostics", {
      headers: AUTH_HEADER,
    });
    expect.soft(res.status).toBe(200);
    const body = (await res.json()) as {
      feeds: {
        id: string;
        last_status: string | null;
        last_error: string | null;
        fetch_error_count: number;
      }[];
    };
    expect(body.feeds.length).toBeGreaterThan(0);
    const f = body.feeds[0];
    expect.soft(f.last_status).toBe("error");
    expect.soft(f.last_error).toBe("connection refused");
    expect.soft(f.fetch_error_count).toBe(1);
  });

  it("200: articles 投入後に articles_total / articles_30d / last_published_at が反映される", async () => {
    await syncFeeds(env.DB, [FEED_A]);

    // articles を直接挿入
    const recentAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const oldAt = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO articles (guid, feed_id, title, url, published_at, fetched_at, category, lang)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      ).bind(
        "guid-recent",
        "feed-alpha",
        "Recent Article",
        "https://example.com/r",
        recentAt,
        recentAt,
        "bigtech",
        "en",
      ),
      env.DB.prepare(
        `INSERT INTO articles (guid, feed_id, title, url, published_at, fetched_at, category, lang)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      ).bind(
        "guid-old",
        "feed-alpha",
        "Old Article",
        "https://example.com/o",
        oldAt,
        oldAt,
        "bigtech",
        "en",
      ),
    ]);

    const res = await SELF.fetch("https://example.com/api/admin/feeds/diagnostics", {
      headers: AUTH_HEADER,
    });
    expect.soft(res.status).toBe(200);
    const body = (await res.json()) as {
      feeds: {
        id: string;
        articles_total: number;
        articles_30d: number;
        last_published_at: string | null;
      }[];
    };
    const f = body.feeds[0];
    expect.soft(f.articles_total).toBe(2);
    expect.soft(f.articles_30d).toBe(1); // recentAt のみが 30d 以内
    expect.soft(f.last_published_at).toBe(recentAt);
  });
});
