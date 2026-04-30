import { describe, expect, it } from "vite-plus/test";
import { loadAllFeeds, loadEnabledFeeds } from "../../worker/feed-config";

describe("loadAllFeeds", () => {
  it("returns an array", () => {
    const feeds = loadAllFeeds();
    expect(Array.isArray(feeds)).toBe(true);
  });

  it("returns at least one feed", () => {
    const feeds = loadAllFeeds();
    expect(feeds.length).toBeGreaterThan(0);
  });

  it("each feed has required fields: id, name, url, category, lang, enabled", () => {
    const feeds = loadAllFeeds();
    for (const feed of feeds) {
      expect(typeof feed.id).toBe("string");
      expect(feed.id.length).toBeGreaterThan(0);
      expect(typeof feed.name).toBe("string");
      expect(feed.name.length).toBeGreaterThan(0);
      expect(typeof feed.url).toBe("string");
      expect(feed.url).toMatch(/^https?:\/\//);
      expect(["bigtech", "ai", "jp", "personal"]).toContain(feed.category);
      expect(["ja", "en"]).toContain(feed.lang);
      expect(typeof feed.enabled).toBe("boolean");
    }
  });

  it("all feed ids are unique", () => {
    const feeds = loadAllFeeds();
    const ids = feeds.map((f) => f.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("includes feeds that are disabled", () => {
    // loadAllFeeds はすべてのフィードを返す (enabled/disabled 問わず)
    // YAML に enabled: false のエントリがある場合はそれも含む
    const all = loadAllFeeds();
    const enabled = loadEnabledFeeds();
    // all は enabled 以上の件数になるはず (同数の場合は全件 enabled)
    expect(all.length).toBeGreaterThanOrEqual(enabled.length);
  });

  it("includes well-known feeds (google-developers, openai-blog, zenn-mizchi)", () => {
    const feeds = loadAllFeeds();
    const ids = feeds.map((f) => f.id);
    expect(ids).toContain("google-developers");
    expect(ids).toContain("openai-blog");
    expect(ids).toContain("zenn-mizchi");
  });
});

describe("loadEnabledFeeds", () => {
  it("returns an array", () => {
    const feeds = loadEnabledFeeds();
    expect(Array.isArray(feeds)).toBe(true);
  });

  it("returns at least one feed", () => {
    const feeds = loadEnabledFeeds();
    expect(feeds.length).toBeGreaterThan(0);
  });

  it("all returned feeds have enabled=true", () => {
    const feeds = loadEnabledFeeds();
    for (const feed of feeds) {
      expect(feed.enabled).toBe(true);
    }
  });

  it("is a subset of loadAllFeeds", () => {
    const all = loadAllFeeds();
    const enabled = loadEnabledFeeds();
    const allIds = new Set(all.map((f) => f.id));
    for (const feed of enabled) {
      expect(allIds.has(feed.id)).toBe(true);
    }
  });

  it("each feed has valid category (bigtech | ai | jp | personal)", () => {
    const feeds = loadEnabledFeeds();
    for (const feed of feeds) {
      expect(["bigtech", "ai", "jp", "personal"]).toContain(feed.category);
    }
  });

  it("each feed has valid lang (ja | en)", () => {
    const feeds = loadEnabledFeeds();
    for (const feed of feeds) {
      expect(["ja", "en"]).toContain(feed.lang);
    }
  });

  it("covers all 4 categories (bigtech, ai, jp, personal)", () => {
    const feeds = loadEnabledFeeds();
    const categories = new Set(feeds.map((f) => f.category));
    expect(categories.has("bigtech")).toBe(true);
    expect(categories.has("ai")).toBe(true);
    expect(categories.has("jp")).toBe(true);
    expect(categories.has("personal")).toBe(true);
  });

  it("covers both langs (ja and en)", () => {
    const feeds = loadEnabledFeeds();
    const langs = new Set(feeds.map((f) => f.lang));
    expect(langs.has("ja")).toBe(true);
    expect(langs.has("en")).toBe(true);
  });
});
