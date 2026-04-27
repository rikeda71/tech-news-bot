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
