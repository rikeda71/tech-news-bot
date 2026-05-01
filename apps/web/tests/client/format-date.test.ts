import { describe, expect, it } from "vite-plus/test";
import { formatDateShort, formatDatetime } from "../../client/lib/format-date";

// toLocaleString の出力は ICU データに依存するため、実行時に期待値を生成して等値比較する

const ISO = "2024-03-15T10:30:00Z";
const INVALID = "not-a-date";

describe("formatDatetime", () => {
  it("有効な ISO 文字列を ja-JP の年月日 HH:mm 形式にフォーマットする", () => {
    const d = new Date(ISO);
    const expected = d.toLocaleString("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(formatDatetime(ISO)).toBe(expected);
  });

  it("不正な ISO 文字列はそのまま返す", () => {
    expect(formatDatetime(INVALID)).toBe(INVALID);
  });

  it("空文字はそのまま返す", () => {
    expect(formatDatetime("")).toBe("");
  });
});

describe("formatDateShort", () => {
  it("有効な ISO 文字列を ja-JP の month:short day HH:mm 形式にフォーマットする", () => {
    const d = new Date(ISO);
    const expected = d.toLocaleDateString("ja-JP", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(formatDateShort(ISO)).toBe(expected);
  });

  it("不正な ISO 文字列はそのまま返す", () => {
    expect(formatDateShort(INVALID)).toBe(INVALID);
  });

  it("空文字はそのまま返す", () => {
    expect(formatDateShort("")).toBe("");
  });
});
