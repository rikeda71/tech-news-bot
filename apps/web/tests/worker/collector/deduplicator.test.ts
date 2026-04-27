import { describe, expect, it } from "vite-plus/test";
import { buildGuid } from "../../../worker/collector/deduplicator";

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
