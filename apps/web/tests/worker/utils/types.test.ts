import { describe, expect, it } from "vite-plus/test";
import { makeOneOf } from "../../../worker/utils/types";

describe("makeOneOf", () => {
  const VALUES = ["bigtech", "ai", "jp", "zenn"] as const;
  const isCategory = makeOneOf<(typeof VALUES)[number]>(VALUES);

  describe("returns true for values included in the list", () => {
    it("returns true for 'bigtech'", () => {
      expect(isCategory("bigtech")).toBe(true);
    });

    it("returns true for 'ai'", () => {
      expect(isCategory("ai")).toBe(true);
    });

    it("returns true for 'jp'", () => {
      expect(isCategory("jp")).toBe(true);
    });

    it("returns true for 'zenn'", () => {
      expect(isCategory("zenn")).toBe(true);
    });
  });

  describe("returns false for values not included in the list", () => {
    it("returns false for a random string", () => {
      expect(isCategory("unknown")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isCategory("")).toBe(false);
    });

    it("returns false for a string that partially matches", () => {
      expect(isCategory("big")).toBe(false);
    });

    it("returns false for case-mismatched value", () => {
      expect(isCategory("BigTech")).toBe(false);
      expect(isCategory("AI")).toBe(false);
    });
  });

  describe("returns false for undefined and null", () => {
    it("returns false for undefined", () => {
      expect(isCategory(undefined)).toBe(false);
    });

    it("returns false for null", () => {
      expect(isCategory(null)).toBe(false);
    });
  });

  describe("works with single-element list", () => {
    const isSingle = makeOneOf(["only"] as const);

    it("returns true for the single allowed value", () => {
      expect(isSingle("only")).toBe(true);
    });

    it("returns false for any other string", () => {
      expect(isSingle("other")).toBe(false);
    });
  });

  describe("works with empty list", () => {
    const isEmpty = makeOneOf([] as const);

    it("returns false for any string", () => {
      expect(isEmpty("anything")).toBe(false);
    });

    it("returns false for undefined", () => {
      expect(isEmpty(undefined)).toBe(false);
    });
  });
});
