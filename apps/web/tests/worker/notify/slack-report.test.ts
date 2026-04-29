import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import {
  buildPayload,
  postReportNotification,
  type ReportNotifyParams,
} from "../../../worker/notify/slack-report";

const WEBHOOK_URL = "https://hooks.slack.com/services/test/webhook";

function makeParams(overrides: Partial<ReportNotifyParams> = {}): ReportNotifyParams {
  return {
    kind: "daily",
    period_start: "2026-04-28T00:00:00.000Z",
    period_end: "2026-04-29T00:00:00.000Z",
    category: null,
    lang: null,
    source_skill: "tech-news-digest",
    generated_at: "2026-04-29T00:01:00.000Z",
    content_bytes: 1024,
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("buildPayload", () => {
  it("header contains kind and period_end date", () => {
    const { blocks } = buildPayload(makeParams());
    const header = (blocks as { type: string; text: { text: string } }[]).find(
      (b) => b.type === "header",
    );
    expect(header?.text.text).toContain("daily");
    expect(header?.text.text).toContain("2026-04-29");
  });

  it("text field contains kind and content_bytes as fallback", () => {
    const { text } = buildPayload(makeParams({ content_bytes: 2048 }));
    expect(text).toContain("daily");
    expect(text).toContain("2048");
  });

  it("shows '全体' when category is null", () => {
    const { blocks } = buildPayload(makeParams({ category: null }));
    const sections = (blocks as { type: string; text?: { text: string } }[]).filter(
      (b) => b.type === "section",
    );
    expect(sections.some((s) => s.text?.text.includes("全体"))).toBe(true);
  });

  it("shows '全言語' when lang is null", () => {
    const { blocks } = buildPayload(makeParams({ lang: null }));
    const sections = (blocks as { type: string; text?: { text: string } }[]).filter(
      (b) => b.type === "section",
    );
    expect(sections.some((s) => s.text?.text.includes("全言語"))).toBe(true);
  });

  it("shows category name when category is specified", () => {
    const { blocks } = buildPayload(makeParams({ category: "bigtech" }));
    const sections = (blocks as { type: string; text?: { text: string } }[]).filter(
      (b) => b.type === "section",
    );
    expect(sections.some((s) => s.text?.text.includes("bigtech"))).toBe(true);
  });

  it("does not include viewer_url block when viewer_url is undefined", () => {
    const { blocks } = buildPayload(makeParams({ viewer_url: undefined }));
    const sections = (blocks as { type: string; text?: { text: string } }[]).filter(
      (b) => b.type === "section",
    );
    // viewer_url がない場合は「レポートを開く」リンクが含まれない
    expect(sections.every((s) => !s.text?.text.includes("レポートを開く"))).toBe(true);
  });

  it("includes viewer_url link when viewer_url is provided", () => {
    const url = "https://example.com/reports/1";
    const { blocks } = buildPayload(makeParams({ viewer_url: url }));
    const sections = (blocks as { type: string; text?: { text: string } }[]).filter(
      (b) => b.type === "section",
    );
    expect(sections.some((s) => s.text?.text.includes(url))).toBe(true);
    expect(sections.some((s) => s.text?.text.includes("レポートを開く"))).toBe(true);
  });

  it("shows source_skill in section", () => {
    const { blocks } = buildPayload(makeParams({ source_skill: "tech-news-weekly" }));
    const sections = (blocks as { type: string; text?: { text: string } }[]).filter(
      (b) => b.type === "section",
    );
    expect(sections.some((s) => s.text?.text.includes("tech-news-weekly"))).toBe(true);
  });

  it("shows generated_at in section", () => {
    const { blocks } = buildPayload(makeParams({ generated_at: "2026-04-29T00:01:00.000Z" }));
    const sections = (blocks as { type: string; text?: { text: string } }[]).filter(
      (b) => b.type === "section",
    );
    expect(sections.some((s) => s.text?.text.includes("2026-04-29T00:01:00.000Z"))).toBe(true);
  });
});

describe("postReportNotification", () => {
  it("returns posted=false and does not call fetch when webhookUrl is undefined", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await postReportNotification(undefined, makeParams());
    expect(result.posted).toBe(false);
    expect(result.error).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns posted=true when webhook returns 200", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 200 }));
    const result = await postReportNotification(WEBHOOK_URL, makeParams());
    expect(result.posted).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("calls fetch with POST method and correct URL", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await postReportNotification(WEBHOOK_URL, makeParams());
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    expect(init?.method).toBe("POST");
  });

  it("returns posted=false with error when webhook returns non-2xx (500)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 500 }));
    const result = await postReportNotification(WEBHOOK_URL, makeParams());
    expect(result.posted).toBe(false);
    expect(result.error).toBe("status 500");
  });

  it("returns posted=false with error when fetch throws (AbortError timeout)", async () => {
    const abortError = new DOMException("The operation was aborted.", "AbortError");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(abortError);
    const result = await postReportNotification(WEBHOOK_URL, makeParams());
    expect(result.posted).toBe(false);
    expect(result.error).toBe("The operation was aborted.");
  });

  it("returns posted=false with error when fetch throws generic error", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const result = await postReportNotification(WEBHOOK_URL, makeParams());
    expect(result.posted).toBe(false);
    expect(result.error).toBe("Failed to fetch");
  });

  it("payload body contains kind and content_bytes", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    await postReportNotification(WEBHOOK_URL, makeParams({ kind: "weekly", content_bytes: 512 }));
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string) as {
      text: string;
      blocks: unknown[];
    };
    expect(body.text).toContain("weekly");
    expect(body.text).toContain("512");
    expect(Array.isArray(body.blocks)).toBe(true);
  });
});
