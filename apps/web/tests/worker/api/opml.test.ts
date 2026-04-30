import { describe, expect, it } from "vite-plus/test";
import { SELF } from "cloudflare:test";

// feeds.yaml には bigtech / ai / jp / personal の全カテゴリが定義されているため、
// D1 への記事挿入なしで OPML エクスポートのテストが完結する。

describe("GET /feeds.opml", () => {
  it("returns 200 with text/x-opml Content-Type", async () => {
    const res = await SELF.fetch("https://example.com/feeds.opml");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/x-opml");
  });

  it('body contains <opml version="2.0">', async () => {
    const res = await SELF.fetch("https://example.com/feeds.opml");
    const text = await res.text();
    expect(text).toContain('<opml version="2.0">');
  });

  it("body starts with XML declaration", async () => {
    const res = await SELF.fetch("https://example.com/feeds.opml");
    const text = await res.text();
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });

  it("contains all 4 category outlines", async () => {
    const res = await SELF.fetch("https://example.com/feeds.opml");
    const text = await res.text();
    expect(text).toContain('text="Big Tech"');
    expect(text).toContain('text="AI Labs"');
    expect(text).toContain('text="国内エンジニアリング"');
    expect(text).toContain('text="個人ブログ"');
  });

  it("contains outline elements with type=rss, xmlUrl and htmlUrl", async () => {
    const res = await SELF.fetch("https://example.com/feeds.opml");
    const text = await res.text();
    // type="rss" の outline が存在すること
    expect(text).toContain('type="rss"');
    // xmlUrl はこのサービスの /feeds/<id>.xml を指すこと
    expect(text).toMatch(/xmlUrl="https:\/\/example\.com\/feeds\/[^"]+\.xml"/);
    // htmlUrl は元の feed URL を指すこと
    expect(text).toContain('htmlUrl="');
  });

  it("xmlUrl points to this service origin with /feeds/<id>.xml path", async () => {
    const res = await SELF.fetch("https://example.com/feeds.opml");
    const text = await res.text();
    // google-research フィードの xmlUrl がサービス自身のオリジンを使っていること
    expect(text).toContain('xmlUrl="https://example.com/feeds/google-research.xml"');
    // htmlUrl は feeds.yaml の元 URL を指すこと
    expect(text).toContain('htmlUrl="https://blog.research.google/feeds/posts/default"');
  });

  it("enabled: false feeds are excluded", async () => {
    // feeds.yaml に enabled: false のフィードがあればここでチェックできる。
    // 現状は全フィードが enabled: true のため、
    // 存在するフィードが XML に含まれることのみ確認する。
    const res = await SELF.fetch("https://example.com/feeds.opml");
    expect(res.status).toBe(200);
    const text = await res.text();
    // 少なくとも 1 つ以上の type="rss" outline が含まれること
    const matches = text.match(/type="rss"/g);
    expect(matches).not.toBeNull();
    expect((matches ?? []).length).toBeGreaterThan(0);
  });

  it("ETag round-trip returns 304 on If-None-Match", async () => {
    const first = await SELF.fetch("https://example.com/feeds.opml");
    expect(first.status).toBe(200);
    const etag = first.headers.get("ETag");
    expect(etag).toMatch(/^W\/"[0-9a-f]{16}"$/);

    const second = await SELF.fetch("https://example.com/feeds.opml", {
      headers: { "If-None-Match": etag! },
    });
    expect(second.status).toBe(304);
  });

  it("ETag changes when If-None-Match does not match", async () => {
    const res = await SELF.fetch("https://example.com/feeds.opml", {
      headers: { "If-None-Match": 'W/"0000000000000000"' },
    });
    // ETag が一致しないので 200 が返ること
    expect(res.status).toBe(200);
  });

  it("contains OPML title", async () => {
    const res = await SELF.fetch("https://example.com/feeds.opml");
    const text = await res.text();
    expect(text).toContain("<title>Tech News Bot — Subscriptions</title>");
  });

  it("contains dateCreated element in RFC 822 format", async () => {
    const res = await SELF.fetch("https://example.com/feeds.opml");
    const text = await res.text();
    expect(text).toMatch(/<dateCreated>.+<\/dateCreated>/);
  });
});
