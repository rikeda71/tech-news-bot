import { Hono } from "hono";
import type { Context } from "hono";
import type { Env } from "../types";
import { getReport, listReports, upsertReport } from "../db/reports";
import type { ReportInput, ReportKind } from "../db/reports";
import { postReportNotification } from "../notify/slack-report";
import type {
  AdminReportDetailResponse,
  AdminReportListResponse,
  AdminReportSaveResponse,
} from "./types";

const app = new Hono<{ Bindings: Env }>();

const VALID_KINDS = new Set<ReportKind>(["daily", "weekly", "monthly"]);
const VALID_CATEGORIES = new Set(["bigtech", "ai", "jp", "zenn"]);
const VALID_LANGS = new Set(["ja", "en"]);
// content が極端に長くなるのを防ぐ (D1 の row size と Worker の CPU 時間を意識)。
// 1MB は markdown レポートとしては十分すぎる量。
const MAX_CONTENT_BYTES = 1_000_000;

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function isValidAdminToken(
  provided: string,
  current: string | undefined,
  next: string | undefined,
): boolean {
  if (current && timingSafeEqual(provided, current)) return true;
  if (next && timingSafeEqual(provided, next)) return true;
  return false;
}

// admin token を検証して、失敗時に Response を返す。成功時は null を返す。
function authGuard(c: Context<{ Bindings: Env }>): Response | null {
  const current = c.env.ADMIN_TOKEN;
  const next = c.env.ADMIN_TOKEN_NEXT;
  if (!current) {
    return c.json({ error: "ADMIN_TOKEN is not configured" }, 503);
  }
  const auth = c.req.header("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || !isValidAdminToken(token, current, next)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return null;
}

function isISO8601(s: unknown): s is string {
  if (typeof s !== "string" || s.length === 0) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) && d.toISOString() === s;
}

interface PostBody {
  kind?: unknown;
  period_start?: unknown;
  period_end?: unknown;
  category?: unknown;
  lang?: unknown;
  content?: unknown;
  meta?: unknown;
  source_skill?: unknown;
  generated_at?: unknown;
}

// body をバリデートして ReportInput を構築する。エラーは error 文字列を返す。
function parseInput(
  body: PostBody,
): { ok: true; input: ReportInput } | { ok: false; error: string } {
  if (typeof body.kind !== "string" || !VALID_KINDS.has(body.kind as ReportKind)) {
    return { ok: false, error: "kind must be one of: daily | weekly | monthly" };
  }
  if (!isISO8601(body.period_start)) {
    return { ok: false, error: "period_start must be ISO 8601 string" };
  }
  if (!isISO8601(body.period_end)) {
    return { ok: false, error: "period_end must be ISO 8601 string" };
  }
  if (!isISO8601(body.generated_at)) {
    return { ok: false, error: "generated_at must be ISO 8601 string" };
  }
  if (typeof body.content !== "string" || body.content.length === 0) {
    return { ok: false, error: "content must be non-empty string" };
  }
  if (body.content.length > MAX_CONTENT_BYTES) {
    return { ok: false, error: `content exceeds ${MAX_CONTENT_BYTES} bytes` };
  }
  if (typeof body.source_skill !== "string" || body.source_skill.length === 0) {
    return { ok: false, error: "source_skill must be non-empty string" };
  }

  let category: string | null = null;
  if (body.category !== undefined && body.category !== null) {
    if (typeof body.category !== "string" || !VALID_CATEGORIES.has(body.category)) {
      return { ok: false, error: "category must be one of: bigtech | ai | jp | zenn (or null)" };
    }
    category = body.category;
  }

  let lang: string | null = null;
  if (body.lang !== undefined && body.lang !== null) {
    if (typeof body.lang !== "string" || !VALID_LANGS.has(body.lang)) {
      return { ok: false, error: "lang must be one of: ja | en (or null)" };
    }
    lang = body.lang;
  }

  let metaJson: string | null = null;
  if (body.meta !== undefined && body.meta !== null) {
    try {
      metaJson = JSON.stringify(body.meta);
    } catch {
      return { ok: false, error: "meta must be JSON-serializable" };
    }
  }

  return {
    ok: true,
    input: {
      kind: body.kind as ReportKind,
      period_start: body.period_start,
      period_end: body.period_end,
      category,
      lang,
      content: body.content,
      meta_json: metaJson,
      source_skill: body.source_skill,
      generated_at: body.generated_at,
    },
  };
}

app.post("/", async (c) => {
  if (c.env.READONLY === "1") {
    return c.json({ error: "read-only mode" }, 403);
  }
  const denied = authGuard(c);
  if (denied) return denied;

  const rawBody = await c.req.text().catch(() => "");
  if (rawBody.trim() === "") {
    return c.json({ error: "request body is required" }, 400);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return c.json({ error: "request body must be a JSON object" }, 400);
  }
  const validated = parseInput(parsed as PostBody);
  if (!validated.ok) {
    return c.json({ error: validated.error }, 400);
  }

  const { id } = await upsertReport(c.env.DB, validated.input);

  // Slack 通知: waitUntil でレスポンスをブロックせずに投げる。失敗しても D1 への保存は成功済みなので無視。
  const notifyPromise = postReportNotification(c.env.SLACK_WEBHOOK_URL, {
    kind: validated.input.kind,
    period_start: validated.input.period_start,
    period_end: validated.input.period_end,
    category: validated.input.category,
    lang: validated.input.lang,
    source_skill: validated.input.source_skill,
    generated_at: validated.input.generated_at,
    content_bytes: validated.input.content.length,
    viewer_url: undefined,
  });
  c.executionCtx?.waitUntil(notifyPromise);

  return c.json<AdminReportSaveResponse>({ ok: true, id });
});

app.get("/", async (c) => {
  const denied = authGuard(c);
  if (denied) return denied;

  const kindParam = c.req.query("kind");
  let kind: ReportKind | undefined;
  if (kindParam !== undefined) {
    if (!VALID_KINDS.has(kindParam as ReportKind)) {
      return c.json({ error: "kind must be one of: daily | weekly | monthly" }, 400);
    }
    kind = kindParam as ReportKind;
  }

  const limitParam = Number(c.req.query("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;

  const reports = await listReports(c.env.DB, { kind, limit });
  return c.json<AdminReportListResponse>({ reports });
});

app.get("/:id", async (c) => {
  const denied = authGuard(c);
  if (denied) return denied;

  const idParam = Number(c.req.param("id"));
  if (!Number.isFinite(idParam) || idParam <= 0) {
    return c.json({ error: "invalid id" }, 400);
  }
  const detail = await getReport(c.env.DB, idParam);
  if (!detail) {
    return c.json({ error: "report not found" }, 404);
  }
  return c.json<AdminReportDetailResponse>({ report: detail });
});

export default app;
