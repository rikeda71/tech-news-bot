import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:test";
import {
  maybeAlert,
  notifyCollectorFailure,
  sendAlert,
  type AlertRunResult,
} from "../../../worker/collector/alert";
import {
  getFeedStreaks,
  syncFeeds,
  recordFetchError,
  recordFetchSuccess,
} from "../../../worker/db/feeds";
import type { CollectResult } from "../../../worker/collector/index";
import type { Env, FeedConfig } from "../../../worker/types";

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

describe("sendAlert", () => {
  const makeResult = (failed: number, total: number): AlertRunResult => {
    const results: CollectResult[] = [];
    for (let i = 0; i < failed; i++) {
      results.push(errResult(`feed-${i}`, `HTTP ${500 + i}`));
    }
    for (let i = failed; i < total; i++) {
      results.push(okResult(`feed-${i}`));
    }
    return { total, results };
  };

  it("does not call webhook when COLLECTOR_ALERT_WEBHOOK is not set", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const mockEnv = { ...env, COLLECTOR_ALERT_WEBHOOK: undefined } as unknown as Env;
    await sendAlert(mockEnv, makeResult(10, 30));
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not call webhook when COLLECTOR_ALERT_WEBHOOK is empty string", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const mockEnv = { ...env, COLLECTOR_ALERT_WEBHOOK: "" } as unknown as Env;
    await sendAlert(mockEnv, makeResult(10, 30));
    expect(spy).not.toHaveBeenCalled();
  });

  it("calls webhook when failed feeds >= threshold (default 5)", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const mockEnv = { ...env, COLLECTOR_ALERT_WEBHOOK: WEBHOOK_URL } as unknown as Env;
    await sendAlert(mockEnv, makeResult(5, 30));

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    const body = JSON.parse(init?.body as string) as {
      text: string;
      blocks: { type: string; text: { type: string; text: string } }[];
    };
    expect(body.text).toContain("collector alert");
    expect(body.blocks).toHaveLength(1);
    expect(body.blocks[0].text.type).toBe("mrkdwn");
    expect(body.blocks[0].text.text).toContain("Failed:");
  });

  it("does not call webhook when failed feeds < threshold (default 5)", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const mockEnv = { ...env, COLLECTOR_ALERT_WEBHOOK: WEBHOOK_URL } as unknown as Env;
    await sendAlert(mockEnv, makeResult(4, 30));
    expect(spy).not.toHaveBeenCalled();
  });

  it("respects COLLECTOR_ALERT_THRESHOLD env var", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const mockEnv = {
      ...env,
      COLLECTOR_ALERT_WEBHOOK: WEBHOOK_URL,
      COLLECTOR_ALERT_THRESHOLD: "3",
    } as unknown as Env;
    await sendAlert(mockEnv, makeResult(3, 30));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("limits top errors to 5 in the payload", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const mockEnv = { ...env, COLLECTOR_ALERT_WEBHOOK: WEBHOOK_URL } as unknown as Env;
    // 10 件失敗しても blocks には最大 5 件しか含まれない
    await sendAlert(mockEnv, makeResult(10, 30));

    const body = JSON.parse(spy.mock.calls[0][1]?.body as string) as {
      blocks: { type: string; text: { type: string; text: string } }[];
    };
    const mrkdwn = body.blocks[0].text.text;
    // "feed-5" 〜 "feed-9" は含まれないことを確認 (top 5 = feed-0 〜 feed-4)
    expect(mrkdwn).toContain("feed-0");
    expect(mrkdwn).toContain("feed-4");
    expect(mrkdwn).not.toContain("feed-5");
  });

  it("does not throw on non-2xx webhook response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 500 }));
    const mockEnv = { ...env, COLLECTOR_ALERT_WEBHOOK: WEBHOOK_URL } as unknown as Env;
    await expect(sendAlert(mockEnv, makeResult(5, 30))).resolves.toBeUndefined();
  });

  it("does not throw on network error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const mockEnv = { ...env, COLLECTOR_ALERT_WEBHOOK: WEBHOOK_URL } as unknown as Env;
    await expect(sendAlert(mockEnv, makeResult(5, 30))).resolves.toBeUndefined();
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
