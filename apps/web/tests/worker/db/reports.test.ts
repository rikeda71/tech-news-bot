import { describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:test";
import { findOverlappingReports, isReportKind, upsertReport } from "../../../worker/db/reports";
import type { ReportInput } from "../../../worker/db/reports";

function baseInput(overrides: Partial<ReportInput> = {}): ReportInput {
  return {
    kind: "weekly",
    period_start: "2026-04-21T00:00:00.000Z",
    period_end: "2026-04-28T00:00:00.000Z",
    category: null,
    lang: null,
    content: "# Test Report",
    meta_json: null,
    source_skill: "test",
    generated_at: "2026-04-28T00:01:00.000Z",
    ...overrides,
  };
}

describe("isReportKind", () => {
  it("returns true for valid kinds", () => {
    expect(isReportKind("daily")).toBe(true);
    expect(isReportKind("weekly")).toBe(true);
    expect(isReportKind("monthly")).toBe(true);
  });

  it("returns false for an unknown string", () => {
    expect(isReportKind("yearly")).toBe(false);
  });

  it("returns false for non-string values (null / undefined / number)", () => {
    expect(isReportKind(null)).toBe(false);
    expect(isReportKind(undefined)).toBe(false);
    expect(isReportKind(42)).toBe(false);
  });
});

describe("findOverlappingReports", () => {
  it("returns empty array when no rows exist", async () => {
    const overlaps = await findOverlappingReports(env.DB, baseInput());
    expect(overlaps).toHaveLength(0);
  });

  it("returns empty array for exact same period (handled by UNIQUE upsert)", async () => {
    await upsertReport(env.DB, baseInput({ generated_at: "2026-04-28T00:00:00.000Z" }));
    // 完全一致は overlap ではない
    const overlaps = await findOverlappingReports(
      env.DB,
      baseInput({
        period_start: "2026-04-21T00:00:00.000Z",
        period_end: "2026-04-28T00:00:00.000Z",
      }),
    );
    expect(overlaps).toHaveLength(0);
  });

  it("detects partial overlap (start shifted)", async () => {
    const inserted = await upsertReport(
      env.DB,
      baseInput({ generated_at: "2026-04-28T00:00:00.000Z" }),
    );
    // inserted が ok: true であることは guard (id アクセスの前提)
    expect(inserted.ok).toBe(true);
    // 既存: 04-21〜04-28 / 新規: 04-22〜04-29 → overlap
    const overlaps = await findOverlappingReports(
      env.DB,
      baseInput({
        period_start: "2026-04-22T00:00:00.000Z",
        period_end: "2026-04-29T00:00:00.000Z",
      }),
    );
    // length は guard (overlaps[0] アクセスの前提)。id は独立した属性
    expect(overlaps).toHaveLength(1);
    expect.soft(overlaps[0]?.id).toBe(inserted.ok ? inserted.id : undefined);
  });

  it("returns empty array for adjacent period (new start == existing end)", async () => {
    await upsertReport(env.DB, baseInput({ generated_at: "2026-04-28T00:00:00.000Z" }));
    // 既存 end == 新規 start → 半開区間で overlap なし
    const overlaps = await findOverlappingReports(
      env.DB,
      baseInput({
        period_start: "2026-04-28T00:00:00.000Z",
        period_end: "2026-05-05T00:00:00.000Z",
      }),
    );
    expect(overlaps).toHaveLength(0);
  });

  it("returns empty array for different category", async () => {
    await upsertReport(
      env.DB,
      baseInput({ category: null, generated_at: "2026-04-28T00:00:00.000Z" }),
    );
    // category=bigtech は別グループ → overlap なし
    const overlaps = await findOverlappingReports(
      env.DB,
      baseInput({
        category: "bigtech",
        period_start: "2026-04-22T00:00:00.000Z",
        period_end: "2026-04-29T00:00:00.000Z",
      }),
    );
    expect(overlaps).toHaveLength(0);
  });
});

describe("upsertReport overlap guard", () => {
  it("returns ok: false when overlapping row exists", async () => {
    await upsertReport(env.DB, baseInput({ generated_at: "2026-04-28T00:00:00.000Z" }));
    const result = await upsertReport(
      env.DB,
      baseInput({
        period_start: "2026-04-22T00:00:00.000Z",
        period_end: "2026-04-29T00:00:00.000Z",
        generated_at: "2026-04-29T00:00:00.000Z",
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("ok: false result contains conflicting ids", async () => {
    const first = await upsertReport(
      env.DB,
      baseInput({ generated_at: "2026-04-28T00:00:00.000Z" }),
    );
    // first が ok: true であることは guard (id アクセスの前提)
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const result = await upsertReport(
      env.DB,
      baseInput({
        period_start: "2026-04-22T00:00:00.000Z",
        period_end: "2026-04-29T00:00:00.000Z",
        generated_at: "2026-04-29T00:00:00.000Z",
      }),
    );
    // result が ok: false であることは guard (conflictingIds アクセスの前提)
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect.soft(result.conflictingIds).toContain(first.id);
    }
  });
});
