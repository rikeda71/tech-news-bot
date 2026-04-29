import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { SELF } from "cloudflare:test";
import type {
  AdminReportDetailResponse,
  AdminReportListResponse,
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
    expect(body.ok).toBe(true);
    expect(typeof body.id).toBe("number");
    expect(body.id).toBeGreaterThan(0);
  });

  it("200: accepts ADMIN_TOKEN_NEXT (rotation)", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: { ...NEXT_AUTH, "content-type": "application/json" },
      body: JSON.stringify(buildPayload({ period_start: "2026-04-27T00:00:00.000Z" })),
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
          period_start: "2026-04-26T00:00:00.000Z",
          generated_at: "2026-04-27T00:00:00.000Z",
          content: "older",
        }),
      ),
    });
    await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(
        buildPayload({
          period_start: "2026-04-28T00:00:00.000Z",
          generated_at: "2026-04-29T00:00:00.000Z",
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
    expect(body.reports[0].generated_at >= body.reports[1].generated_at).toBe(true);
  });

  it("200: filters by kind", async () => {
    await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(buildPayload({ kind: "weekly" })),
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
    expect(body.report.content).toBe("with meta");
    expect(body.report.meta_json).toContain("dedup_total");
  });
});

describe("POST /api/admin/reports — Slack notification", () => {
  it("200: POST succeeds (and does not throw) when SLACK_WEBHOOK_URL is not set", async () => {
    // テスト環境では SLACK_WEBHOOK_URL が未定義のため、no-op になり POST 自体は 200
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(buildPayload()),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminReportSaveResponse;
    expect(body.ok).toBe(true);
  });

  it("200: POST succeeds even when Slack webhook returns non-2xx (Slack failure does not affect D1 save)", async () => {
    // fetch を spy して Slack webhook 呼び出しが 500 を返しても POST 自体は 200
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 500 }));
    const res = await SELF.fetch("https://example.com/api/admin/reports", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(buildPayload({ period_start: "2026-04-27T00:00:00.000Z" })),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminReportSaveResponse;
    expect(body.ok).toBe(true);
  });
});
