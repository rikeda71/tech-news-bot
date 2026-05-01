import { describe, expect, it } from "vite-plus/test";
import { parseLimit, parsePositiveInt } from "../../../worker/api/_helpers";

describe("parseLimit", () => {
  const opts = { default: 20, max: 100 };

  it("正常な数値文字列を clamp せずに返す", () => {
    expect(parseLimit("10", opts)).toBe(10);
  });

  it("undefined はデフォルト値を返す", () => {
    expect(parseLimit(undefined, opts)).toBe(20);
  });

  it("空文字列はデフォルト値を返す (NaN フォールバック)", () => {
    expect(parseLimit("", opts)).toBe(20);
  });

  it("数値でない文字列はデフォルト値を返す", () => {
    expect(parseLimit("abc", opts)).toBe(20);
  });

  it("0 は min (1) に clamp される", () => {
    expect(parseLimit("0", opts)).toBe(1);
  });

  it("負数は min (1) に clamp される", () => {
    expect(parseLimit("-5", opts)).toBe(1);
  });

  it("max を超える値は max に clamp される", () => {
    expect(parseLimit("9999", opts)).toBe(100);
  });

  it("min オプションを指定すると下限が変わる", () => {
    expect(parseLimit("0", { default: 20, max: 100, min: 5 })).toBe(5);
  });
});

describe("parsePositiveInt", () => {
  it("正の整数文字列をそのまま返す", () => {
    expect(parsePositiveInt("10")).toBe(10);
  });

  it("0 は null を返す", () => {
    expect(parsePositiveInt("0")).toBeNull();
  });

  it("負数は null を返す", () => {
    expect(parsePositiveInt("-5")).toBeNull();
  });

  it("数値でない文字列は null を返す", () => {
    expect(parsePositiveInt("abc")).toBeNull();
  });

  it("小数は null を返す (整数でない)", () => {
    expect(parsePositiveInt("1.5")).toBeNull();
  });

  it("空文字列は null を返す", () => {
    expect(parsePositiveInt("")).toBeNull();
  });
});
