import { describe, expect, it } from "vite-plus/test";
import { safeHref } from "../../client/utils/safe-href";

describe("safeHref", () => {
  it("https: URL をそのまま返す", () => {
    expect(safeHref("https://example.com")).toBe("https://example.com");
  });

  it("http: URL をそのまま返す", () => {
    expect(safeHref("http://example.com")).toBe("http://example.com");
  });

  it("javascript: URI を '#' にフォールバックする", () => {
    expect(safeHref("javascript:alert(1)")).toBe("#");
  });

  it("data: URI を '#' にフォールバックする", () => {
    expect(safeHref("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==")).toBe("#");
  });

  it("vbscript: URI を '#' にフォールバックする", () => {
    expect(safeHref("vbscript:msgbox()")).toBe("#");
  });

  it("undefined を '#' にフォールバックする", () => {
    expect(safeHref(undefined)).toBe("#");
  });

  it("空文字を '#' にフォールバックする", () => {
    expect(safeHref("")).toBe("#");
  });

  it("前後に空白がある https: URL を trim して返す", () => {
    expect(safeHref("  https://x.com  ")).toBe("https://x.com");
  });

  it("前後に空白がある http: URL を trim して返す", () => {
    expect(safeHref("  http://example.com  ")).toBe("http://example.com");
  });

  it("スキームなし相対 URL を '#' にフォールバックする", () => {
    expect(safeHref("/foo/bar")).toBe("#");
  });
});
