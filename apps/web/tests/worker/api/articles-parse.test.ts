import { describe, it, expect } from "vite-plus/test";
import { SELF } from "cloudflare:test";
import { decodeCursor, encodeCursor, isValidDateRange } from "../../../worker/api/articles-parse";

// ---- decodeCursor ----

describe("decodeCursor", () => {
  it("returns null when input is undefined", () => {
    expect(decodeCursor(undefined)).toBeNull();
  });

  it("returns null when input is empty string", () => {
    expect(decodeCursor("")).toBeNull();
  });

  it("returns null for invalid base64", () => {
    expect(decodeCursor("not-valid-base64!!!")).toBeNull();
  });

  it("returns null when base64 decodes to non-JSON", () => {
    // btoa("not json")
    expect(decodeCursor(btoa("not json"))).toBeNull();
  });

  it("returns null when publishedAt field is missing", () => {
    const encoded = btoa(JSON.stringify({ id: 1 }));
    expect(decodeCursor(encoded)).toBeNull();
  });

  it("returns null when id field is missing", () => {
    const encoded = btoa(JSON.stringify({ publishedAt: "2024-04-01T00:00:00Z" }));
    expect(decodeCursor(encoded)).toBeNull();
  });

  it("returns null when publishedAt is not ISO datetime format", () => {
    const encoded = btoa(JSON.stringify({ publishedAt: "2024-04-01", id: 1 }));
    expect(decodeCursor(encoded)).toBeNull();
  });

  it("returns null when id is negative", () => {
    const encoded = btoa(JSON.stringify({ publishedAt: "2024-04-01T00:00:00.000Z", id: -1 }));
    expect(decodeCursor(encoded)).toBeNull();
  });

  it("returns null when id is non-integer (float)", () => {
    const encoded = btoa(JSON.stringify({ publishedAt: "2024-04-01T00:00:00.000Z", id: 1.5 }));
    expect(decodeCursor(encoded)).toBeNull();
  });

  it("returns null when id is a string", () => {
    const encoded = btoa(JSON.stringify({ publishedAt: "2024-04-01T00:00:00.000Z", id: "1" }));
    expect(decodeCursor(encoded)).toBeNull();
  });

  it("returns Cursor for a valid encoded cursor", () => {
    const cursor = { publishedAt: "2024-04-01T00:00:00.000Z", id: 42 };
    const encoded = btoa(JSON.stringify(cursor));
    const result = decodeCursor(encoded);
    expect(result).toEqual(cursor);
  });

  it("returns Cursor when id is 0 (boundary)", () => {
    const cursor = { publishedAt: "2024-04-01T00:00:00.000Z", id: 0 };
    const encoded = btoa(JSON.stringify(cursor));
    const result = decodeCursor(encoded);
    expect(result).toEqual(cursor);
  });

  it("strips extraneous fields and returns only publishedAt and id", () => {
    const encoded = btoa(
      JSON.stringify({ publishedAt: "2024-04-01T00:00:00.000Z", id: 1, foo: "bar" }),
    );
    const result = decodeCursor(encoded);
    expect(result).not.toBeNull();
    expect(Object.keys(result!).toSorted()).toEqual(["id", "publishedAt"]);
  });
});

// ---- encodeCursor ----

describe("encodeCursor", () => {
  it("returns null when cursor is null", () => {
    expect(encodeCursor(null)).toBeNull();
  });

  it("returns the exact base64 encoding of the cursor JSON", () => {
    const cursor = { publishedAt: "2024-04-01T00:00:00.000Z", id: 42 };
    const result = encodeCursor(cursor);
    expect(result).toBe(btoa(JSON.stringify(cursor)));
  });

  it("round-trips: encodeCursor -> decodeCursor returns original value", () => {
    const cursor = { publishedAt: "2024-04-01T12:34:56.000Z", id: 99 };
    const encoded = encodeCursor(cursor);
    expect(encoded).not.toBeNull();
    const decoded = decodeCursor(encoded ?? undefined);
    expect(decoded).toEqual(cursor);
  });
});

// ---- isValidDateRange ----

describe("isValidDateRange", () => {
  it("returns true when input is undefined", () => {
    expect(isValidDateRange(undefined)).toBe(true);
  });

  it("returns true when input is empty string (treated as absent)", () => {
    expect(isValidDateRange("")).toBe(true);
  });

  it("returns true for a valid YYYY-MM-DD date", () => {
    expect(isValidDateRange("2024-04-01")).toBe(true);
  });

  it("returns true for a valid ISO datetime string", () => {
    expect(isValidDateRange("2024-04-01T00:00:00.000Z")).toBe(true);
  });

  it("returns false for invalid format (no dashes)", () => {
    expect(isValidDateRange("20240401")).toBe(false);
  });

  it("returns false for invalid format (extra characters after date)", () => {
    expect(isValidDateRange("2024-04-01foo")).toBe(false);
  });

  it("returns false for 9999-99-99 (invalid month/day)", () => {
    expect(isValidDateRange("9999-99-99")).toBe(false);
  });

  it("returns false for 2024-02-30 (non-existent date)", () => {
    expect(isValidDateRange("2024-02-30")).toBe(false);
  });

  it("returns false for 2024-13-01 (invalid month)", () => {
    expect(isValidDateRange("2024-13-01")).toBe(false);
  });
});

// ---- parseListQuery (HTTP integration via SELF.fetch) ----

describe("parseListQuery via GET /api/articles/by-author/:author", () => {
  // parseListQuery は Context に依存するため HTTP 経由でテストする。
  // by-author endpoint は parseListQuery(c) をデフォルトオプション (limit 1-50) で呼ぶ。

  it("returns 400 when limit=0 (below minimum)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/someone?limit=0");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit exceeds maxLimit (51)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/someone?limit=51");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("returns 400 when limit is non-numeric", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/someone?limit=abc");
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/limit/);
  });

  it("accepts limit=1 (minimum boundary)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/someone?limit=1");
    // 記事がなくても limit 自体は valid なので 200 が返る
    expect(res.status).toBe(200);
  });

  it("accepts limit=50 (maximum boundary)", async () => {
    const res = await SELF.fetch("https://example.com/api/articles/by-author/someone?limit=50");
    expect(res.status).toBe(200);
  });

  it("returns 400 when cursor is malformed (invalid base64)", async () => {
    const res = await SELF.fetch(
      "https://example.com/api/articles/by-author/someone?cursor=!!!invalid!!!",
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/cursor/);
  });

  it("returns 400 when cursor decodes to valid base64 but invalid JSON shape", async () => {
    const malformed = btoa(JSON.stringify({ bad: "shape" }));
    const res = await SELF.fetch(
      `https://example.com/api/articles/by-author/someone?cursor=${malformed}`,
    );
    expect(res.status).toBe(400);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/cursor/);
  });
});
