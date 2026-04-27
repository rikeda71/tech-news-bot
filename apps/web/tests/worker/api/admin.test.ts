import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { syncFeeds } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

const TEST_FEED: FeedConfig = {
  id: "test-feed",
  name: "Test Feed",
  url: "https://example.com/feed.xml",
  category: "bigtech",
  lang: "en",
  enabled: true,
};

const AUTH_HEADER = { authorization: "Bearer test-admin-token" };

// feeds.yaml に実在する ID (テスト環境でも loadAllFeeds() から参照される)
const REAL_FEED_ID = "google-research";

beforeEach(async () => {
  await syncFeeds(env.DB, [TEST_FEED]);
});

describe("POST /api/admin/feeds/:id/enabled", () => {
  it("200: toggles enabled to false", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/test-feed/enabled", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; enabled: boolean };
    expect(body.id).toBe("test-feed");
    expect(body.enabled).toBe(false);
  });

  it("200: toggles enabled back to true", async () => {
    // disable first
    await SELF.fetch("https://example.com/api/admin/feeds/test-feed/enabled", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    const res = await SELF.fetch("https://example.com/api/admin/feeds/test-feed/enabled", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; enabled: boolean };
    expect(body.enabled).toBe(true);
  });

  it("401: rejects unauthenticated request", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/test-feed/enabled", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(401);
  });

  it("401: rejects invalid token", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/test-feed/enabled", {
      method: "POST",
      headers: { authorization: "Bearer wrong-token", "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(401);
  });

  it("404: returns not found for unknown feed id", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/no-such-feed/enabled", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(404);
  });

  it("400: rejects body without enabled field", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/test-feed/enabled", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });
    expect(res.status).toBe(400);
  });

  it("400: rejects body with non-boolean enabled", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/test-feed/enabled", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ enabled: "true" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/collector/run", () => {
  it(
    "200: 認証 OK + body なし (全件実行) → results 配列を返す",
    async () => {
      const res = await SELF.fetch("https://example.com/api/admin/collector/run", {
        method: "POST",
        headers: { ...AUTH_HEADER },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        started_at: string;
        finished_at: string;
        results: { feed_id: string; status: string; new_articles: number }[];
      };
      expect(typeof body.started_at).toBe("string");
      expect(typeof body.finished_at).toBe("string");
      expect(Array.isArray(body.results)).toBe(true);
      // 全 enabled feed に対して results が返る (外部 fetch はテスト環境では失敗するが error として返る)
      expect(body.results.length).toBeGreaterThan(0);
      for (const r of body.results) {
        expect(typeof r.feed_id).toBe("string");
        expect(["ok", "error", "not_modified"]).toContain(r.status);
        expect(typeof r.new_articles).toBe("number");
      }
    },
    60_000,
  );

  it("401: 認証なし → 401", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collector/run", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("200: feed_ids 指定 → 指定 feed のみ results に含まれる", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collector/run", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ feed_ids: [REAL_FEED_ID] }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      started_at: string;
      finished_at: string;
      results: { feed_id: string }[];
    };
    expect(body.results).toHaveLength(1);
    expect(body.results[0].feed_id).toBe(REAL_FEED_ID);
  });

  it("400: 不明な feed_id を指定 → 400", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collector/run", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ feed_ids: ["unknown-id-xyz"] }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/unknown feed_ids/);
  });

  it("400: feed_ids が配列でない → 400", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collector/run", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ feed_ids: "google-research" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("feed_ids must be an array");
  });
});
