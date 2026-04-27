import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { SELF } from "cloudflare:test";

const AUTH_HEADER = { authorization: "Bearer test-admin-token" };

const VALID_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Example Tech Blog</title>
    <language>en</language>
    <item><title>Article 1</title><link>https://example.com/1</link></item>
    <item><title>Article 2</title><link>https://example.com/2</link></item>
    <item><title>Article 3</title><link>https://example.com/3</link></item>
  </channel>
</rss>`;

const VALID_ATOM = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ja">
  <title>日本語テックブログ</title>
  <entry><title>記事1</title><id>1</id><link href="https://example.com/1"/></entry>
  <entry><title>記事2</title><id>2</id><link href="https://example.com/2"/></entry>
</feed>`;

beforeEach(() => {
  // setup.ts の beforeEach で reset + applyD1Migrations が実行される
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/feeds/validate", () => {
  it("401: Authorization ヘッダなし → 401", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    expect(res.status).toBe(401);
  });

  it("401: 不正トークン → 401", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/validate", {
      method: "POST",
      headers: { authorization: "Bearer wrong-token", "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    expect(res.status).toBe(401);
  });

  it("400: body なし → 400", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/validate", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
    });
    expect(res.status).toBe(400);
  });

  it("400: url フィールドなし → 400", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/validate", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });
    expect(res.status).toBe(400);
  });

  it("400: 不正な URL 形式 → 400", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/validate", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ url: "not-a-url" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/invalid url/i);
  });

  it("400: http/https 以外のスキーマ → 400", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/validate", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ url: "ftp://example.com/feed.xml" }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/invalid url/i);
  });

  it("200 + ok:true: valid RSS XML を返す fetch mock → title / lang / item_count を含む", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(VALID_RSS, {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      }),
    );

    const res = await SELF.fetch("https://example.com/api/admin/feeds/validate", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      title: string;
      lang: string | null;
      item_count: number;
    };
    expect(body.ok).toBe(true);
    expect(body.title).toBe("Example Tech Blog");
    expect(body.lang).toBe("en");
    expect(body.item_count).toBe(3);
  });

  it("200 + ok:true: valid Atom XML (日本語) → lang が ja", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(VALID_ATOM, {
        status: 200,
        headers: { "content-type": "application/atom+xml" },
      }),
    );

    const res = await SELF.fetch("https://example.com/api/admin/feeds/validate", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.atom" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      title: string;
      lang: string | null;
      item_count: number;
    };
    expect(body.ok).toBe(true);
    expect(body.title).toBe("日本語テックブログ");
    expect(body.lang).toBe("ja");
    expect(body.item_count).toBe(2);
  });

  it("200 + ok:false: fetch が 404 → ok:false と error を含む", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    const res = await SELF.fetch("https://example.com/api/admin/feeds/validate", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  it("200 + ok:false: XML でないレスポンス (HTML) → ok:false", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<html><body>Not a feed</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const res = await SELF.fetch("https://example.com/api/admin/feeds/validate", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/notfeed" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  it("200 + ok:false: 不正 XML → ok:false", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<invalid><xml>broken", {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      }),
    );

    const res = await SELF.fetch("https://example.com/api/admin/feeds/validate", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/bad.xml" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
  });

  it("200 + ok:false: fetch がネットワークエラー → ok:false", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const res = await SELF.fetch("https://example.com/api/admin/feeds/validate", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ url: "https://unreachable.example.com/feed.xml" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
  });

  it("Cache-Control: no-store ヘッダが設定されている", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(VALID_RSS, {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      }),
    );

    const res = await SELF.fetch("https://example.com/api/admin/feeds/validate", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    expect(res.status).toBe(200);
    const cacheControl = res.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("no-store");
  });
});
