import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:test";
import { maybeAlert, notifyCollectorFailure } from "../../../worker/collector/alert";
import {
  getFeedStreaks,
  syncFeeds,
  recordFetchError,
  recordFetchSuccess,
} from "../../../worker/db/feeds";
import type { CollectResult } from "../../../worker/collector/index";
import type { FeedConfig } from "../../../worker/types";

const WEBHOOK_URL = "https://hooks.example.com/webhook";

const okResult = (id: string): CollectResult => ({
  feedId: id,
  status: "ok",
  inserted: 1,
  parsed: 1,
});
const errResult = (id: string, error = "HTTP 503"): CollectResult => ({
  feedId: id,
  status: "error",
  inserted: 0,
  parsed: 0,
  error,
});

const TEST_FEEDS: FeedConfig[] = [
  {
    id: "feed-a",
    name: "Feed A",
    url: "https://a.test/rss",
    category: "bigtech",
    lang: "en",
    enabled: true,
  },
  {
    id: "feed-b",
    name: "Feed B",
    url: "https://b.test/rss",
    category: "ai",
    lang: "en",
    enabled: true,
  },
  {
    id: "feed-c",
    name: "Feed C",
    url: "https://c.test/rss",
    category: "jp",
    lang: "ja",
    enabled: true,
  },
];

beforeEach(async () => {
  await syncFeeds(env.DB, TEST_FEEDS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("notifyCollectorFailure", () => {
  it("posts to webhook URL with text payload", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await notifyCollectorFailure(WEBHOOK_URL, {
      failedFeeds: [{ id: "feed-a", error: "HTTP 503 Service Unavailable" }],
      streakFeeds: [],
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    expect(init?.method).toBe("POST");
    const body = JSON.parse(init?.body as string) as { text: string };
    expect(body.text).toContain("[tech-news-bot]");
    expect(body.text).toContain("feed-a");
  });

  it("includes streak feeds in payload", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await notifyCollectorFailure(WEBHOOK_URL, {
      failedFeeds: [],
      streakFeeds: [{ id: "feed-b", consecutiveFailures: 7 }],
    });

    const body = JSON.parse(spy.mock.calls[0][1]?.body as string) as { text: string };
    expect(body.text).toContain("feed-b");
    expect(body.text).toContain("7 consecutive failures");
  });

  it("does not throw on non-2xx response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 500 }));

    await expect(
      notifyCollectorFailure(WEBHOOK_URL, { failedFeeds: [], streakFeeds: [] }),
    ).resolves.toBeUndefined();
  });

  it("does not throw on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(
      notifyCollectorFailure(WEBHOOK_URL, { failedFeeds: [], streakFeeds: [] }),
    ).resolves.toBeUndefined();
  });
});

describe("maybeAlert", () => {
  it("does not call webhook when ALERT_WEBHOOK_URL is undefined", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    await maybeAlert(
      undefined,
      [errResult("feed-a"), errResult("feed-b"), errResult("feed-c")],
      [],
      3,
      5,
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("calls webhook when failed feeds >= minFailures (3)", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await maybeAlert(
      WEBHOOK_URL,
      [errResult("feed-a"), errResult("feed-b"), errResult("feed-c")],
      [],
      3,
      5,
    );

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not call webhook when failed feeds < minFailures", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    await maybeAlert(WEBHOOK_URL, [errResult("feed-a"), errResult("feed-b")], [], 3, 5);

    expect(spy).not.toHaveBeenCalled();
  });

  it("calls webhook when a feed streak >= feedStreak (5)", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const streaks = [{ id: "feed-a", consecutive_failures: 5 }];
    await maybeAlert(WEBHOOK_URL, [okResult("feed-a")], streaks, 3, 5);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not call webhook when streak < feedStreak threshold", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const streaks = [{ id: "feed-a", consecutive_failures: 4 }];
    await maybeAlert(WEBHOOK_URL, [okResult("feed-a")], streaks, 3, 5);

    expect(spy).not.toHaveBeenCalled();
  });
});

describe("getFeedStreaks and consecutive_failures tracking", () => {
  const fetchedAt = new Date().toISOString();

  it("consecutive_failures is 0 initially", async () => {
    const streaks = await getFeedStreaks(env.DB);
    for (const s of streaks) {
      expect(s.consecutive_failures).toBe(0);
    }
  });

  it("increments consecutive_failures on recordFetchError", async () => {
    await recordFetchError(env.DB, "feed-a", fetchedAt, "HTTP 503");
    await recordFetchError(env.DB, "feed-a", fetchedAt, "HTTP 503");

    const streaks = await getFeedStreaks(env.DB);
    const a = streaks.find((s) => s.id === "feed-a");
    expect(a?.consecutive_failures).toBe(2);
  });

  it("resets consecutive_failures to 0 on recordFetchSuccess", async () => {
    await recordFetchError(env.DB, "feed-b", fetchedAt, "HTTP 503");
    await recordFetchError(env.DB, "feed-b", fetchedAt, "HTTP 503");
    await recordFetchSuccess(env.DB, "feed-b", fetchedAt, 0);

    const streaks = await getFeedStreaks(env.DB);
    const b = streaks.find((s) => s.id === "feed-b");
    expect(b?.consecutive_failures).toBe(0);
  });
});
