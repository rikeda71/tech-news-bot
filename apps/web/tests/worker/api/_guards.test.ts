import { describe, expect, it } from "vite-plus/test";
import { VALID_CATEGORIES, VALID_LANGS, isCategory, isLang } from "../../../worker/api/_guards";
import type { FeedCategory, FeedLang } from "../../../worker/types";

describe("VALID_CATEGORIES / VALID_LANGS — 配列の不変性", () => {
  it("VALID_CATEGORIES は 4 要素を持つ", () => {
    expect(VALID_CATEGORIES).toHaveLength(4);
  });

  it("VALID_CATEGORIES は期待する値を過不足なく含む", () => {
    expect.soft(VALID_CATEGORIES).toContain("bigtech");
    expect.soft(VALID_CATEGORIES).toContain("ai");
    expect.soft(VALID_CATEGORIES).toContain("jp");
    expect.soft(VALID_CATEGORIES).toContain("personal");
  });

  it("VALID_LANGS は 2 要素を持つ", () => {
    expect(VALID_LANGS).toHaveLength(2);
  });

  it("VALID_LANGS は期待する値を過不足なく含む", () => {
    expect.soft(VALID_LANGS).toContain("ja");
    expect.soft(VALID_LANGS).toContain("en");
  });
});

describe("isCategory", () => {
  it("有効な全 category 値で true を返す", () => {
    for (const v of VALID_CATEGORIES) {
      expect.soft(isCategory(v)).toBe(true);
    }
  });

  it("無効な文字列で false を返す", () => {
    expect.soft(isCategory("unknown")).toBe(false);
    expect.soft(isCategory("")).toBe(false);
    expect.soft(isCategory("BIGTECH")).toBe(false);
    expect.soft(isCategory("AI")).toBe(false);
  });

  it("string 以外の型で false を返す", () => {
    expect.soft(isCategory(null)).toBe(false);
    expect.soft(isCategory(undefined)).toBe(false);
    expect.soft(isCategory(42)).toBe(false);
    expect.soft(isCategory({})).toBe(false);
  });

  it("narrow 後の値を FeedCategory 型として代入できる", () => {
    const raw: unknown = "ai";
    if (isCategory(raw)) {
      // コンパイルエラーなく代入できれば型が正しく narrow されている
      const cat: FeedCategory = raw;
      expect(cat).toBe("ai");
    } else {
      expect.fail("isCategory('ai') should return true");
    }
  });
});

describe("isLang", () => {
  it("有効な全 lang 値で true を返す", () => {
    for (const v of VALID_LANGS) {
      expect.soft(isLang(v)).toBe(true);
    }
  });

  it("無効な文字列で false を返す", () => {
    expect.soft(isLang("zh")).toBe(false);
    expect.soft(isLang("")).toBe(false);
    expect.soft(isLang("JA")).toBe(false);
    expect.soft(isLang("EN")).toBe(false);
  });

  it("string 以外の型で false を返す", () => {
    expect.soft(isLang(null)).toBe(false);
    expect.soft(isLang(undefined)).toBe(false);
    expect.soft(isLang(0)).toBe(false);
    expect.soft(isLang(false)).toBe(false);
  });

  it("narrow 後の値を FeedLang 型として代入できる", () => {
    const raw: unknown = "ja";
    if (isLang(raw)) {
      // コンパイルエラーなく代入できれば型が正しく narrow されている
      const lang: FeedLang = raw;
      expect(lang).toBe("ja");
    } else {
      expect.fail("isLang('ja') should return true");
    }
  });
});
