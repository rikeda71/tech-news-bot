import { describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:test";
import { OverlapError, findOverlappingReports, upsertReport } from "../../../worker/db/reports";
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
    await upsertReport(env.DB, baseInput({ generated_at: "2026-04-28T00:00:00.000Z" }));
    // 既存: 04-21〜04-28 / 新規: 04-22〜04-29 → overlap
    const overlaps = await findOverlappingReports(
      env.DB,
      baseInput({
        period_start: "2026-04-22T00:00:00.000Z",
        period_end: "2026-04-29T00:00:00.000Z",
      }),
    );
    expect(overlaps.length).toBeGreaterThan(0);
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
  it("throws OverlapError when overlapping row exists", async () => {
    await upsertReport(env.DB, baseInput({ generated_at: "2026-04-28T00:00:00.000Z" }));
    await expect(
      upsertReport(
        env.DB,
        baseInput({
          period_start: "2026-04-22T00:00:00.000Z",
          period_end: "2026-04-29T00:00:00.000Z",
          generated_at: "2026-04-29T00:00:00.000Z",
        }),
      ),
    ).rejects.toBeInstanceOf(OverlapError);
  });

  it("OverlapError contains conflicting ids", async () => {
    const { id } = await upsertReport(
      env.DB,
      baseInput({ generated_at: "2026-04-28T00:00:00.000Z" }),
    );
    let caught: OverlapError | null = null;
    try {
      await upsertReport(
        env.DB,
        baseInput({
          period_start: "2026-04-22T00:00:00.000Z",
          period_end: "2026-04-29T00:00:00.000Z",
          generated_at: "2026-04-29T00:00:00.000Z",
        }),
      );
    } catch (err) {
      if (err instanceof OverlapError) caught = err;
    }
    expect(caught).not.toBeNull();
    expect(caught!.conflictingIds).toContain(id);
  });
});
