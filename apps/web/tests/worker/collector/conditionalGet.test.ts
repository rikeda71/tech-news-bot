import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:test";
import { fetchFeed } from "../../../worker/collector/index";
import { loadFeedHeaders, syncFeeds, updateFeedHeaders } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

const DUMMY_URL = "https://example.com/feed.xml";
const VALID_XML = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title></channel></rss>`;

const TEST_FEED: FeedConfig = {
  id: "test-feed",
  name: "Test Feed",
  url: DUMMY_URL,
  category: "bigtech",
  lang: "en",
  enabled: true,
};

beforeEach(async () => {
  await syncFeeds(env.DB, [TEST_FEED]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchFeed conditional GET", () => {
  it("returns xml with notModified=false on 200 OK (no conditional headers)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(VALID_XML, { status: 200 }));

    const result = await fetchFeed(DUMMY_URL, 10000, 0);
    expect.soft(result.notModified).toBe(false);
    expect.soft(result.xml).toBe(VALID_XML);
  });

  it("returns notModified=true on 304 and xml is null", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 304 }));

    const result = await fetchFeed(DUMMY_URL, 10000, 0);
    expect.soft(result.notModified).toBe(true);
    expect.soft(result.xml).toBeNull();
  });

  it("sends If-None-Match header when etag is provided", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(VALID_XML, { status: 200 }));

    await fetchFeed(DUMMY_URL, 10000, 0, { etag: '"abc123"', lastModified: null });

    const callArgs = spy.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers["if-none-match"]).toBe('"abc123"');
  });

  it("sends If-Modified-Since header when lastModified is provided", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(VALID_XML, { status: 200 }));

    const lastMod = "Mon, 01 Jan 2024 00:00:00 GMT";
    await fetchFeed(DUMMY_URL, 10000, 0, { etag: null, lastModified: lastMod });

    const callArgs = spy.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect(headers["if-modified-since"]).toBe(lastMod);
  });

  it("does not send conditional headers when both are null", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(VALID_XML, { status: 200 }));

    await fetchFeed(DUMMY_URL, 10000, 0, { etag: null, lastModified: null });

    const callArgs = spy.mock.calls[0];
    const headers = callArgs[1]?.headers as Record<string, string>;
    expect.soft(headers["if-none-match"]).toBeUndefined();
    expect.soft(headers["if-modified-since"]).toBeUndefined();
  });

  it("saves etag from 200 response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(VALID_XML, {
        status: 200,
        headers: { etag: '"newetag"', "last-modified": "Tue, 02 Jan 2024 00:00:00 GMT" },
      }),
    );

    const result = await fetchFeed(DUMMY_URL, 10000, 0);
    expect.soft(result.etag).toBe('"newetag"');
    expect.soft(result.lastModified).toBe("Tue, 02 Jan 2024 00:00:00 GMT");
  });
});

describe("loadFeedHeaders / updateFeedHeaders", () => {
  it("returns null headers for a feed with no saved headers", async () => {
    const headers = await loadFeedHeaders(env.DB, "test-feed");
    expect.soft(headers.last_etag).toBeNull();
    expect.soft(headers.last_modified).toBeNull();
  });

  it("saves and retrieves etag and last_modified", async () => {
    await updateFeedHeaders(env.DB, "test-feed", '"v1"', "Wed, 03 Jan 2024 00:00:00 GMT");

    const headers = await loadFeedHeaders(env.DB, "test-feed");
    expect.soft(headers.last_etag).toBe('"v1"');
    expect.soft(headers.last_modified).toBe("Wed, 03 Jan 2024 00:00:00 GMT");
  });

  it("overwrites existing headers on subsequent update", async () => {
    await updateFeedHeaders(env.DB, "test-feed", '"v1"', "Wed, 03 Jan 2024 00:00:00 GMT");
    await updateFeedHeaders(env.DB, "test-feed", '"v2"', null);

    const headers = await loadFeedHeaders(env.DB, "test-feed");
    expect.soft(headers.last_etag).toBe('"v2"');
    expect.soft(headers.last_modified).toBeNull();
  });

  it("returns null for unknown feed id", async () => {
    const headers = await loadFeedHeaders(env.DB, "non-existent-feed");
    expect.soft(headers.last_etag).toBeNull();
    expect.soft(headers.last_modified).toBeNull();
  });
});
