import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { fetchFeed, isRetryableError } from "../../../worker/collector/index";

// fetchFeedOnce が内部で setTimeout を使うので fake timers で制御する
// vi.useFakeTimers は cloudflare worker pool 環境でも setTimeout を置き換える

describe("isRetryableError", () => {
  it("returns true for AbortError (timeout)", () => {
    const err = new DOMException("timeout", "AbortError");
    expect(isRetryableError(err)).toBe(true);
  });

  it("returns true for TypeError (network failure)", () => {
    expect(isRetryableError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("returns true for HTTP 503", () => {
    expect(isRetryableError(new Error("HTTP 503 Service Unavailable"))).toBe(true);
  });

  it("returns true for HTTP 500", () => {
    expect(isRetryableError(new Error("HTTP 500 Internal Server Error"))).toBe(true);
  });

  it("returns true for HTTP 429 (rate limit)", () => {
    expect(isRetryableError(new Error("HTTP 429 Too Many Requests"))).toBe(true);
  });

  it("returns false for HTTP 404", () => {
    expect(isRetryableError(new Error("HTTP 404 Not Found"))).toBe(false);
  });

  it("returns false for HTTP 400", () => {
    expect(isRetryableError(new Error("HTTP 400 Bad Request"))).toBe(false);
  });

  it("returns false for HTTP 403", () => {
    expect(isRetryableError(new Error("HTTP 403 Forbidden"))).toBe(false);
  });

  it("returns false for generic Error (not HTTP)", () => {
    expect(isRetryableError(new Error("Feed body too large: 9999 bytes"))).toBe(false);
  });

  it("returns false for non-Error values", () => {
    expect(isRetryableError("string error")).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(42)).toBe(false);
  });
});

describe("fetchFeed retry behavior", () => {
  const DUMMY_URL = "https://example.com/feed.xml";
  const VALID_XML = "<rss><channel></channel></rss>";

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("succeeds on first attempt without retry", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(VALID_XML, { status: 200 }));

    const result = await fetchFeed(DUMMY_URL, 10000, 2);
    expect(result.xml).toBe(VALID_XML);
    expect(result.notModified).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("retries on 503 and succeeds on 2nd attempt", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("Service Unavailable", { status: 503 }))
      .mockResolvedValueOnce(new Response(VALID_XML, { status: 200 }));

    const promise = fetchFeed(DUMMY_URL, 10000, 2);
    // backoff の setTimeout を即座に解決する
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.xml).toBe(VALID_XML);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("retries on AbortError and succeeds on 2nd attempt", async () => {
    const abortErr = new DOMException("timeout", "AbortError");
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(abortErr)
      .mockResolvedValueOnce(new Response(VALID_XML, { status: 200 }));

    const promise = fetchFeed(DUMMY_URL, 10000, 2);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.xml).toBe(VALID_XML);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("exhausts all retries on consecutive 503 and throws final error", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("Service Unavailable", { status: 503 }));

    // rejects でラップしてから runAllTimersAsync で backoff を進める
    const rejectPromise = expect(fetchFeed(DUMMY_URL, 10000, 2)).rejects.toThrow("HTTP 503");
    await vi.runAllTimersAsync();
    await rejectPromise;

    // 初回 + 2 回リトライ = 計 3 回
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 404 (permanent error)", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("Not Found", { status: 404, statusText: "Not Found" }));

    await expect(fetchFeed(DUMMY_URL, 10000, 2)).rejects.toThrow("HTTP 404");
    // 4xx はリトライしないので 1 回のみ
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does not retry on 400 (permanent error)", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("Bad Request", { status: 400, statusText: "Bad Request" }));

    await expect(fetchFeed(DUMMY_URL, 10000, 2)).rejects.toThrow("HTTP 400");
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("retries on TypeError (network failure)", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response(VALID_XML, { status: 200 }));

    const promise = fetchFeed(DUMMY_URL, 10000, 2);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.xml).toBe(VALID_XML);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("respects maxRetries=0 and does not retry", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("Service Unavailable", { status: 503 }));

    await expect(fetchFeed(DUMMY_URL, 10000, 0)).rejects.toThrow("HTTP 503");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
