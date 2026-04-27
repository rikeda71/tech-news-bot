import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:test";
import { getEnabledFeedIds, setFeedEnabled, syncFeeds } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

const FEED_A: FeedConfig = {
  id: "feed-a",
  name: "Feed A",
  url: "https://example.com/a.xml",
  category: "bigtech",
  lang: "en",
  enabled: true,
};

const FEED_B: FeedConfig = {
  id: "feed-b",
  name: "Feed B",
  url: "https://example.com/b.xml",
  category: "ai",
  lang: "en",
  enabled: true,
};

beforeEach(async () => {
  await syncFeeds(env.DB, [FEED_A, FEED_B]);
});

describe("getEnabledFeedIds + setFeedEnabled (D1 runtime toggle)", () => {
  it("returns all feeds when both are enabled", async () => {
    const ids = await getEnabledFeedIds(env.DB);
    expect(ids.has("feed-a")).toBe(true);
    expect(ids.has("feed-b")).toBe(true);
  });

  it("excludes a feed disabled via setFeedEnabled", async () => {
    await setFeedEnabled(env.DB, "feed-b", false);

    const ids = await getEnabledFeedIds(env.DB);
    expect(ids.has("feed-a")).toBe(true);
    // feed-b は D1 で disabled にされたため含まれない
    expect(ids.has("feed-b")).toBe(false);
  });

  it("re-enables a feed and it appears again in getEnabledFeedIds", async () => {
    await setFeedEnabled(env.DB, "feed-b", false);
    await setFeedEnabled(env.DB, "feed-b", true);

    const ids = await getEnabledFeedIds(env.DB);
    expect(ids.has("feed-b")).toBe(true);
  });

  it("setFeedEnabled returns found=false for unknown id", async () => {
    const result = await setFeedEnabled(env.DB, "no-such-feed", false);
    expect(result.found).toBe(false);
  });

  it("setFeedEnabled returns found=true for existing feed", async () => {
    const result = await setFeedEnabled(env.DB, "feed-a", false);
    expect(result.found).toBe(true);
  });
});
