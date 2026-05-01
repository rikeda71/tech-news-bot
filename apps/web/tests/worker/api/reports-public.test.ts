import { describe, expect, it } from "vite-plus/test";
import { SELF } from "cloudflare:test";
import type { AdminReportDetailResponse, AdminReportListResponse } from "../../../worker/api/types";

const ADMIN_AUTH = { authorization: "Bearer test-admin-token" };
const ADMIN_JSON = { ...ADMIN_AUTH, "content-type": "application/json" };

interface ReportPayload {
  kind: "daily" | "weekly" | "monthly";
  period_start: string;
  period_end: string;
  category: string | null;
  lang: string | null;
  content: string;
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
    content: "# Daily Report\n\nTest content.",
    source_skill: "tech-news-digest",
    generated_at: "2026-04-29T00:01:00.000Z",
    ...overrides,
  };
}

async function insertReport(payload: Partial<ReportPayload> = {}) {
  const res = await SELF.fetch("https://example.com/api/admin/reports", {
    method: "POST",
    headers: ADMIN_JSON,
    body: JSON.stringify(buildPayload(payload)),
  });
  const body = (await res.json()) as { id: number };
  return body.id;
}

describe("GET /api/reports (公開一覧)", () => {
  it("200: 認証なしでアクセスできる", async () => {
    const res = await SELF.fetch("https://example.com/api/reports");
    expect(res.status).toBe(200);
  });

  it("200: 挿入したレポートが含まれる", async () => {
    await insertReport({ content: "public list test" });

    const res = await SELF.fetch("https://example.com/api/reports");
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminReportListResponse;
    expect.soft(Array.isArray(body.reports)).toBe(true);
    expect.soft(body.reports.length).toBeGreaterThanOrEqual(1);
  });

  it("200: kind フィルタが効く", async () => {
    await insertReport({
      kind: "weekly",
      period_start: "2026-04-21T00:00:00.000Z",
      period_end: "2026-04-28T00:00:00.000Z",
    });

    const res = await SELF.fetch("https://example.com/api/reports?kind=weekly");
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminReportListResponse;
    expect(body.reports.every((r) => r.kind === "weekly")).toBe(true);
  });

  it("400: 無効な kind を拒否する", async () => {
    const res = await SELF.fetch("https://example.com/api/reports?kind=invalid");
    expect(res.status).toBe(400);
  });

  it("200: limit が clamp される (limit=0 → 1 件)", async () => {
    await insertReport();

    const res = await SELF.fetch("https://example.com/api/reports?limit=0");
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminReportListResponse;
    // limit=0 は 1 に clamp されるため最大 1 件
    expect(body.reports.length).toBeLessThanOrEqual(1);
  });

  it("CORS ヘッダが付く", async () => {
    const allowedOrigin = "https://tech-news-bot.rikeda71.workers.dev";
    const res = await SELF.fetch("https://example.com/api/reports", {
      headers: { origin: allowedOrigin },
    });
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
  });
});

describe("GET /api/reports/:id (公開詳細)", () => {
  it("200: 認証なしでアクセスできる", async () => {
    const id = await insertReport({ content: "detail content" });

    const res = await SELF.fetch(`https://example.com/api/reports/${id}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as AdminReportDetailResponse;
    expect.soft(body.report.content).toBe("detail content");
  });

  it("404: 存在しない id", async () => {
    const res = await SELF.fetch("https://example.com/api/reports/999999");
    expect(res.status).toBe(404);
  });

  it("400: 無効な id (文字列)", async () => {
    const res = await SELF.fetch("https://example.com/api/reports/abc");
    expect(res.status).toBe(400);
  });

  it("CORS ヘッダが付く", async () => {
    const allowedOrigin = "https://tech-news-bot.rikeda71.workers.dev";
    const id = await insertReport();

    const res = await SELF.fetch(`https://example.com/api/reports/${id}`, {
      headers: { origin: allowedOrigin },
    });
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("access-control-allow-origin")).toBe(allowedOrigin);
  });
});
