import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { isCategory, isLang, parseCategory, parseLang } from "../../../worker/db/_guards";

// ---------------------------------------------------------------------------
// isCategory
// ---------------------------------------------------------------------------

describe("isCategory", () => {
  it("returns true for all valid categories", () => {
    expect.soft(isCategory("bigtech")).toBe(true);
    expect.soft(isCategory("ai")).toBe(true);
    expect.soft(isCategory("jp")).toBe(true);
    expect.soft(isCategory("personal")).toBe(true);
  });

  it("returns false for unknown string", () => {
    expect(isCategory("general")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect.soft(isCategory(null)).toBe(false);
    expect.soft(isCategory(undefined)).toBe(false);
    expect.soft(isCategory(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isLang
// ---------------------------------------------------------------------------

describe("isLang", () => {
  it("returns true for all valid langs", () => {
    expect.soft(isLang("ja")).toBe(true);
    expect.soft(isLang("en")).toBe(true);
  });

  it("returns false for unknown string", () => {
    expect(isLang("zh")).toBe(false);
  });

  it("returns false for non-string values", () => {
    expect.soft(isLang(null)).toBe(false);
    expect.soft(isLang(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parseCategory: warn + fallback
// ---------------------------------------------------------------------------

describe("parseCategory", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the value as-is for valid categories", () => {
    expect(parseCategory("ai")).toBe("ai");
  });

  it("returns 'bigtech' and emits console.warn for invalid category", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseCategory("garbage");
    expect.soft(result).toBe("bigtech");
    expect.soft(warnSpy).toHaveBeenCalledWith(expect.stringContaining("unexpected category value"));
  });

  it("includes context string in the warning message when provided", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    parseCategory("unknown", "feed=test-feed");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("feed=test-feed"));
  });
});

// ---------------------------------------------------------------------------
// parseLang: warn + fallback
// ---------------------------------------------------------------------------

describe("parseLang", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns the value as-is for valid langs", () => {
    expect(parseLang("ja")).toBe("ja");
  });

  it("returns 'en' and emits console.warn for invalid lang", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseLang("xx");
    expect.soft(result).toBe("en");
    expect.soft(warnSpy).toHaveBeenCalledWith(expect.stringContaining("unexpected lang value"));
  });

  it("includes context string in the warning message when provided", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    parseLang("bad", "feed=test-feed");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("feed=test-feed"));
  });
});
