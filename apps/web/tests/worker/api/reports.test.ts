import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { SELF } from "cloudflare:test";
import type {
  AdminReportDetailResponse,
  AdminReportListResponse,
  AdminReportOverlapResponse,
  AdminReportSaveResponse,
} from "../../../worker/api/types";

const AUTH = { authorization: "Bearer test-admin-token" };
const NEXT_AUTH = { authorization: "Bearer test-admin-token-next" };
const JSON_HEADERS = { ...AUTH, "content-type": "application/json" };

interface ReportPayload {
  kind: "daily" | "weekly" | "monthly";
  period_start: string;
  period_end: string;
  category: string | null;
  lang: string | null;
  content: string;
  meta?: unknown;
  source_skill: string;
  generated_at: string;
}

function buildPayload(overrides: Partial<ReportPayload> = {}): ReportPayload {
  return {
    kind: "daily",
    period_start: "2026-04-28T00:00:00.000Z",
    period_end: "2026-04-29T00:00:00.000Z",
    category: null,
    lang: null,
    content: "# Daily Tech News\n\nSample content.",
    meta: { dedup_total: 42, by_category: { bigtech: 30, ai: 12 } },
    source_skill: "tech-news-digest",
    generated_at: "2026-04-29T00:01:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/admin/reports", () => {
  it("401: rejects unauthenticated request", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildPayload()),
    });
    expect(res.status).toBe(401);
  });

  it("200: accepts current ADMIN_TOKEN", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(buildPayload()),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminReportSaveResponse;
    expect.soft(body.ok).toBe(true);
    expect.soft(typeof body.id).toBe("number");
    expect.soft(body.id).toBeGreaterThan(0);
  });

  it("200: accepts ADMIN_TOKEN_NEXT (rotation)", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: { ...NEXT_AUTH, "content-type": "application/json" },
      body: JSON.stringify(
        buildPayload({
          period_start: "2026-04-30T00:00:00.000Z",
          period_end: "2026-05-01T00:00:00.000Z",
          generated_at: "2026-05-01T00:00:00.000Z",
        }),
      ),
    });
    expect(res.status).toBe(200);
  });

  it("200: upsert preserves id, overwrites content for same period", async () => {
    const first = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(buildPayload({ content: "first" })),
    });
    const firstBody = (await first.json()) as AdminReportSaveResponse;
    const second = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(buildPayload({ content: "second" })),
    });
    const secondBody = (await second.json()) as AdminReportSaveResponse;
    expect(secondBody.id).toBe(firstBody.id);

    const detail = await SELF.fetch(`https://example.com/api/admin/reports/${secondBody.id}`, {
      headers: AUTH,
    });
    const detailBody = (await detail.json()) as AdminReportDetailResponse;
    expect(detailBody.report.content).toBe("second");
  });

  it("200: differentiates rows by category (NULL vs bigtech)", async () => {
    const r1 = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(buildPayload({ category: null, content: "all" })),
    });
    const r2 = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(buildPayload({ category: "bigtech", content: "bigtech only" })),
    });
    const id1 = ((await r1.json()) as AdminReportSaveResponse).id;
    const id2 = ((await r2.json()) as AdminReportSaveResponse).id;
    expect(id1).not.toBe(id2);
  });

  it("400: rejects invalid kind", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(buildPayload({ kind: "yearly" as never })),
    });
    expect(res.status).toBe(400);
  });

  it("400: rejects invalid ISO 8601 period_start", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(buildPayload({ period_start: "yesterday" })),
    });
    expect(res.status).toBe(400);
  });

  // LLM はミリ秒抜きの ISO 8601 (`...:00Z`) を生成しがちなので受け入れる
  it("200: accepts ISO 8601 without milliseconds", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          period_start: "2026-04-27T00:00:00Z",
          period_end: "2026-04-28T00:00:00Z",
          generated_at: "2026-04-28T00:01:00Z",
        }),
      ),
    });
    expect(res.status).toBe(200);
  });

  it("400: rejects empty content", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(buildPayload({ content: "" })),
    });
    expect(res.status).toBe(400);
  });

  it("400: rejects invalid category", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(buildPayload({ category: "unknown" })),
    });
    expect(res.status).toBe(400);
  });

  it("400: rejects empty body", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
    });
    expect(res.status).toBe(400);
  });

  it("400: rejects invalid JSON body", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: "not-json",
    });
    expect(res.status).toBe(400);
  });

  it("400: rejects period_start == period_end", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          period_start: "2026-04-29T00:00:00.000Z",
          period_end: "2026-04-29T00:00:00.000Z",
        }),
      ),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("period_end must be after period_start");
  });

  it("400: rejects period_start > period_end", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          period_start: "2026-04-29T00:00:00.000Z",
          period_end: "2026-04-28T00:00:00.000Z",
        }),
      ),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("period_end must be after period_start");
  });

  // ---- overlap validation ----
  // 各テストは互いに干渉しないよう、独自の月/期間を使う (DB はテスト間でリセットされない)。

  it("200: exact same period → upsert update (no overlap)", async () => {
    // 1回目登録 (2025-01 の週)
    await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-01-06T00:00:00.000Z",
          period_end: "2025-01-13T00:00:00.000Z",
          content: "first",
          generated_at: "2025-01-13T00:00:00.000Z",
        }),
      ),
    });
    // 同一 period で上書き → 200
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-01-06T00:00:00.000Z",
          period_end: "2025-01-13T00:00:00.000Z",
          content: "updated",
          generated_at: "2025-01-13T00:01:00.000Z",
        }),
      ),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminReportSaveResponse;
    expect(body.ok).toBe(true);
  });

  it("409: partial overlap (start shifted by 1 day)", async () => {
    // 既存: 2025-02-03 〜 2025-02-10
    await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-02-03T00:00:00.000Z",
          period_end: "2025-02-10T00:00:00.000Z",
          content: "existing-shift-start",
          generated_at: "2025-02-10T00:00:00.000Z",
        }),
      ),
    });
    // 新規: 2025-02-04 〜 2025-02-11 (start 違い, overlap あり)
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-02-04T00:00:00.000Z",
          period_end: "2025-02-11T00:00:00.000Z",
          content: "overlapping start",
          generated_at: "2025-02-11T00:00:00.000Z",
        }),
      ),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as AdminReportOverlapResponse;
    expect.soft(body.error).toMatch(/overlap/i);
    expect.soft(Array.isArray(body.conflicting_ids)).toBe(true);
    expect.soft(body.conflicting_ids.length).toBeGreaterThan(0);
  });

  it("409: partial overlap (end shifted by 1 day)", async () => {
    // 既存: 2025-03-03 〜 2025-03-10
    await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-03-03T00:00:00.000Z",
          period_end: "2025-03-10T00:00:00.000Z",
          content: "existing-shift-end",
          generated_at: "2025-03-10T00:00:00.000Z",
        }),
      ),
    });
    // 新規: 2025-03-02 〜 2025-03-09 (end 違い, overlap あり)
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-03-02T00:00:00.000Z",
          period_end: "2025-03-09T00:00:00.000Z",
          content: "overlapping end",
          generated_at: "2025-03-11T00:00:00.000Z",
        }),
      ),
    });
    expect(res.status).toBe(409);
    const body = (await res.json()) as AdminReportOverlapResponse;
    expect.soft(body.error).toMatch(/overlap/i);
    expect.soft(body.conflicting_ids.length).toBeGreaterThan(0);
  });

  it("409: new period fully contains existing", async () => {
    // 既存: 2025-04-07 〜 2025-04-12
    await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-04-07T00:00:00.000Z",
          period_end: "2025-04-12T00:00:00.000Z",
          content: "inner-existing",
          generated_at: "2025-04-12T00:00:00.000Z",
        }),
      ),
    });
    // 新規: 2025-04-06 〜 2025-04-13 (既存を完全内包)
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-04-06T00:00:00.000Z",
          period_end: "2025-04-13T00:00:00.000Z",
          content: "outer-new",
          generated_at: "2025-04-13T00:00:00.000Z",
        }),
      ),
    });
    expect(res.status).toBe(409);
  });

  it("409: existing period fully contains new", async () => {
    // 既存: 2025-05-05 〜 2025-05-12
    await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-05-05T00:00:00.000Z",
          period_end: "2025-05-12T00:00:00.000Z",
          content: "outer-existing",
          generated_at: "2025-05-12T00:00:00.000Z",
        }),
      ),
    });
    // 新規: 2025-05-06 〜 2025-05-11 (既存に内包される)
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-05-06T00:00:00.000Z",
          period_end: "2025-05-11T00:00:00.000Z",
          content: "inner-new",
          generated_at: "2025-05-13T00:00:00.000Z",
        }),
      ),
    });
    expect(res.status).toBe(409);
  });

  it("200: adjacent periods (new start == existing end) → no overlap (half-open)", async () => {
    // 既存: 2025-06-02 〜 2025-06-09
    await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-06-02T00:00:00.000Z",
          period_end: "2025-06-09T00:00:00.000Z",
          content: "adjacent prev",
          generated_at: "2025-06-09T00:00:00.000Z",
        }),
      ),
    });
    // 新規: 2025-06-09 〜 2025-06-16 (start == 既存 end → 半開区間で重ならない)
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-06-09T00:00:00.000Z",
          period_end: "2025-06-16T00:00:00.000Z",
          content: "adjacent next",
          generated_at: "2025-06-16T00:00:00.000Z",
        }),
      ),
    });
    expect(res.status).toBe(200);
  });

  it("200: different kind → no overlap check", async () => {
    // 既存: kind=weekly, 2025-07-07 〜 2025-07-14
    await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-07-07T00:00:00.000Z",
          period_end: "2025-07-14T00:00:00.000Z",
          content: "weekly-diff-kind",
          generated_at: "2025-07-14T00:00:00.000Z",
        }),
      ),
    });
    // 新規: kind=monthly, overlapping period → 別 kind なので通る
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "monthly",
          period_start: "2025-07-08T00:00:00.000Z",
          period_end: "2025-07-15T00:00:00.000Z",
          content: "monthly-diff-kind",
          generated_at: "2025-07-15T00:00:00.000Z",
        }),
      ),
    });
    expect(res.status).toBe(200);
  });

  it("200: different category → no overlap check", async () => {
    // 既存: kind=weekly, category=null, 2025-08-04 〜 2025-08-11
    await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-08-04T00:00:00.000Z",
          period_end: "2025-08-11T00:00:00.000Z",
          category: null,
          content: "all-category",
          generated_at: "2025-08-11T00:00:00.000Z",
        }),
      ),
    });
    // 新規: category=bigtech, overlapping period → 別 category なので通る
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-08-05T00:00:00.000Z",
          period_end: "2025-08-12T00:00:00.000Z",
          category: "bigtech",
          content: "bigtech-only",
          generated_at: "2025-08-12T00:00:00.000Z",
        }),
      ),
    });
    expect(res.status).toBe(200);
  });

  it("200: different lang → no overlap check", async () => {
    // 既存: kind=weekly, lang=ja, 2025-09-01 〜 2025-09-08
    await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-09-01T00:00:00.000Z",
          period_end: "2025-09-08T00:00:00.000Z",
          lang: "ja",
          content: "ja-report",
          generated_at: "2025-09-08T00:00:00.000Z",
        }),
      ),
    });
    // 新規: lang=en, overlapping period → 別 lang なので通る
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2025-09-02T00:00:00.000Z",
          period_end: "2025-09-09T00:00:00.000Z",
          lang: "en",
          content: "en-report",
          generated_at: "2025-09-09T00:00:00.000Z",
        }),
      ),
    });
    expect(res.status).toBe(200);
  });
});

describe("GET /api/admin/reports", () => {
  it("401: rejects unauthenticated request", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports");
    expect(res.status).toBe(401);
  });

  it("200: returns inserted reports in DESC order of generated_at", async () => {
    await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          period_start: "2026-03-26T00:00:00.000Z",
          period_end: "2026-03-27T00:00:00.000Z",
          generated_at: "2026-03-27T00:00:00.000Z",
          content: "older",
        }),
      ),
    });
    await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          period_start: "2026-03-28T00:00:00.000Z",
          period_end: "2026-03-29T00:00:00.000Z",
          generated_at: "2026-03-29T00:00:00.000Z",
          content: "newer",
        }),
      ),
    });

    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminReportListResponse;
    expect(body.reports.length).toBeGreaterThanOrEqual(2);
    expect.soft(body.reports[0].generated_at >= body.reports[1].generated_at).toBe(true);
  });

  it("200: filters by kind", async () => {
    await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          kind: "weekly",
          period_start: "2026-10-06T00:00:00.000Z",
          period_end: "2026-10-13T00:00:00.000Z",
          generated_at: "2026-10-13T00:00:00.000Z",
        }),
      ),
    });
    const res = await SELF.fetch("https://example.com/api/admin/reports?kind=weekly", {
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminReportListResponse;
    expect(body.reports.every((r) => r.kind === "weekly")).toBe(true);
  });

  it("400: rejects invalid kind", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports?kind=invalid", {
      headers: AUTH,
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/admin/reports/:id", () => {
  it("404: missing id", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports/999999", {
      headers: AUTH,
    });
    expect(res.status).toBe(404);
  });

  it("400: invalid id", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports/abc", {
      headers: AUTH,
    });
    expect(res.status).toBe(400);
  });

  it("200: returns full content + meta_json", async () => {
    const post = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(buildPayload({ content: "with meta" })),
    });
    const id = ((await post.json()) as AdminReportSaveResponse).id;
    const res = await SELF.fetch(`https://example.com/api/admin/reports/${id}`, {
      headers: AUTH,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminReportDetailResponse;
    expect.soft(body.report.content).toBe("with meta");
    expect.soft(body.report.meta_json).toContain("dedup_total");
  });
});
