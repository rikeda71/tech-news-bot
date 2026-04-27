import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { SELF } from "cloudflare:test";
import { validateFeedUrl } from "../../../worker/collector/index";

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

// ── 統合テスト: 認証・バリデーション (SELF.fetch 経由) ───────────────────────

describe("POST /api/admin/feeds/validate (integration)", () => {
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

  it("200 + ok:false: 外部 fetch は CI 環境では失敗 → ok:false と Cache-Control: no-store", async () => {
    // CI / テスト環境では外部 fetch が AbortError になるため ok:false が返る。
    // Cache-Control と 200 ステータスを確認する。
    const res = await SELF.fetch("https://example.com/api/admin/feeds/validate", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/feed.xml" }),
    });
    expect(res.status).toBe(200);
    const cacheControl = res.headers.get("cache-control") ?? "";
    expect(cacheControl).toContain("no-store");
    const body = (await res.json()) as { ok: boolean };
    // CI では外部 fetch が失敗するため ok:false。テスト環境の制約上、ok:true は下記ユニットテストで検証する。
    expect(typeof body.ok).toBe("boolean");
  });
});

// ── ユニットテスト: validateFeedUrl の parse ロジック (fetch mock 有効) ──────

describe("validateFeedUrl (unit)", () => {
  it("ok:true: valid RSS XML → title / lang / item_count を返す", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(VALID_RSS, {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      }),
    );

    const result = await validateFeedUrl("https://example.com/feed.xml");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok:true");
    expect(result.title).toBe("Example Tech Blog");
    expect(result.lang).toBe("en");
    expect(result.item_count).toBe(3);
  });

  it("ok:true: valid Atom XML (日本語) → lang が ja", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(VALID_ATOM, {
        status: 200,
        headers: { "content-type": "application/atom+xml" },
      }),
    );

    const result = await validateFeedUrl("https://example.com/feed.atom");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok:true");
    expect(result.title).toBe("日本語テックブログ");
    expect(result.lang).toBe("ja");
    expect(result.item_count).toBe(2);
  });

  it("ok:false: fetch が 404 → ok:false と error を含む", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

    const result = await validateFeedUrl("https://example.com/feed.xml");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected ok:false");
    expect(typeof result.error).toBe("string");
    expect(result.error.length).toBeGreaterThan(0);
  });

  it("ok:false: XML でないレスポンス (HTML) → ok:false", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<html><body>Not a feed</body></html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );

    const result = await validateFeedUrl("https://example.com/notfeed");
    expect(result.ok).toBe(false);
  });

  it("ok:false: 不正 XML → ok:false", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("<invalid><xml>broken", {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      }),
    );

    const result = await validateFeedUrl("https://example.com/bad.xml");
    expect(result.ok).toBe(false);
  });

  it("ok:false: fetch がネットワークエラー → ok:false", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await validateFeedUrl("https://unreachable.example.com/feed.xml");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected ok:false");
    expect(typeof result.error).toBe("string");
  });
});
