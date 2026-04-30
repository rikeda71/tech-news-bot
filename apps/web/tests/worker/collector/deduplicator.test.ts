import { describe, expect, it } from "vite-plus/test";
import { buildGuid, normalizeUrl } from "../../../worker/collector/deduplicator";

describe("normalizeUrl", () => {
  it("normalizes http to https", () => {
    expect(normalizeUrl("http://example.com/page")).toBe("https://example.com/page");
  });

  it("keeps https unchanged", () => {
    expect(normalizeUrl("https://example.com/page")).toBe("https://example.com/page");
  });

  it("removes trailing slash from path", () => {
    expect(normalizeUrl("https://example.com/page/")).toBe("https://example.com/page");
  });

  it("does not remove trailing slash from root path", () => {
    // ルートパス "/" はそのまま保持する
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com/");
  });

  it("trims whitespace", () => {
    expect(normalizeUrl("  https://example.com/page  ")).toBe("https://example.com/page");
  });

  it("returns trimmed input for invalid URLs", () => {
    expect(normalizeUrl("  not-a-url  ")).toBe("not-a-url");
  });

  it("combines http and trailing slash normalization", () => {
    expect(normalizeUrl("http://example.com/page/")).toBe("https://example.com/page");
  });
});

describe("buildGuid url-based dedup", () => {
  it("generates same guid for http and https variant of the same URL", async () => {
    const httpGuid = await buildGuid({
      feedId: "f1",
      rawGuid: null,
      url: "http://example.com/page",
    });
    const httpsGuid = await buildGuid({
      feedId: "f1",
      rawGuid: null,
      url: "https://example.com/page",
    });
    expect(httpGuid).toBe(httpsGuid);
  });

  it("generates same guid for URL with and without trailing slash", async () => {
    const withSlash = await buildGuid({
      feedId: "f1",
      rawGuid: null,
      url: "https://example.com/page/",
    });
    const withoutSlash = await buildGuid({
      feedId: "f1",
      rawGuid: null,
      url: "https://example.com/page",
    });
    expect(withSlash).toBe(withoutSlash);
  });
});

describe("buildGuid", () => {
  it("uses raw guid when present", async () => {
    const guid = await buildGuid({ feedId: "f1", rawGuid: "abc-123" });
    expect(guid).toBe("f1:abc-123");
  });

  it("falls back to url-based hash", async () => {
    const guid = await buildGuid({ feedId: "f1", rawGuid: null, url: "https://x.test/a" });
    expect(guid.startsWith("f1:url:")).toBe(true);
  });

  it("falls back to title+date hash", async () => {
    const guid = await buildGuid({
      feedId: "f1",
      rawGuid: null,
      url: null,
      title: "Hello",
      publishedAt: "2024-01-01T00:00:00.000Z",
    });
    expect(guid.startsWith("f1:fallback:")).toBe(true);
  });

  it("is deterministic for same input", async () => {
    const a = await buildGuid({ feedId: "f1", rawGuid: null, url: "https://x.test/a" });
    const b = await buildGuid({ feedId: "f1", rawGuid: null, url: "https://x.test/a" });
    expect(a).toBe(b);
  });
});
