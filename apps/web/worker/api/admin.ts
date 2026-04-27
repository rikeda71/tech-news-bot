import { Hono } from "hono";
import type { Env } from "../types";
import { collectAll, collectFeeds, validateFeedUrl } from "../collector";
import { loadAllFeeds } from "../feed-config";
import { getFeedsDiagnostics, setFeedEnabled } from "../db/feeds";
import { getCronHealth, getFeedFailures, getRun, listRuns, startRun } from "../db/runs";
import type {
  AdminCollectResponse,
  AdminCollectorRunResponse,
  AdminCronHealthResponse,
  AdminFeedEnabledResponse,
  AdminFeedsDiagnosticsResponse,
  AdminRunDetailResponse,
  AdminRunListResponse,
} from "./types";

const app = new Hono<{ Bindings: Env }>();

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// 現行 token または次世代 token のいずれかに一致すれば認証 OK。
// ローテーション期間中は両方を受け入れ、完了後に ADMIN_TOKEN_NEXT を削除する。
function isValidAdminToken(
  provided: string,
  current: string | undefined,
  next: string | undefined,
): boolean {
  if (current && timingSafeEqual(provided, current)) return true;
  if (next && timingSafeEqual(provided, next)) return true;
  return false;
}

app.post("/feeds/validate", async (c) => {
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

  const rawBody = await c.req.text().catch(() => "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return c.json({ error: "invalid JSON body" }, 400);
  }
  const body = parsed as Record<string, unknown>;
  if (!body || typeof body.url !== "string" || !body.url) {
    return c.json({ error: "url is required" }, 400);
  }

  // URL 形式チェック (http/https のみ許可)
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(body.url);
  } catch {
    return c.json({ error: "invalid url" }, 400);
  }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return c.json({ error: "invalid url: only http/https is allowed" }, 400);
  }

  // 12s でタイムアウト。fetch 自体は I/O なので CPU には乗らないが安全マージン。
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);

  let validateResult: Awaited<ReturnType<typeof validateFeedUrl>>;
  try {
    validateResult = await Promise.race([
      validateFeedUrl(body.url),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener("abort", () =>
          reject(new Error("validate timed out after 12s")),
        );
      }),
    ]);
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    validateResult = { ok: false, error: msg };
  }
  clearTimeout(timer);

  c.header("Cache-Control", "no-store");
  return c.json(validateResult);
});

app.post("/collect", async (c) => {
  // READONLY=1 の preview 環境では書き込みを行わない
  if (c.env.READONLY === "1") {
    return c.json({ error: "read-only mode" }, 403);
  }
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

  // body は任意。不正 JSON は 400 を返す。
  const rawBody = await c.req.text().catch(() => "");
  let feedIds: readonly string[] | undefined;
  if (rawBody.trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const body = parsed as Record<string, unknown>;
    if ("feed_id" in body) {
      if (typeof body.feed_id !== "string") {
        return c.json({ error: "feed_id must be a string" }, 400);
      }
      const feedId = body.feed_id;
      // feeds.yaml に存在し enabled なフィードかチェックする
      const allFeeds = loadAllFeeds();
      const matched = allFeeds.find((f) => f.id === feedId && f.enabled);
      if (!matched) {
        return c.json({ error: `feed not found: ${feedId}` }, 404);
      }
      feedIds = [feedId];
    }
  }

  // startRun を先に実行して run_id を即時返す。収集は waitUntil で非同期に実行する。
  const startedAt = new Date().toISOString();
  let runId: number;
  try {
    const feedCount = feedIds ? feedIds.length : loadAllFeeds().filter((f) => f.enabled).length;
    const { run_id } = await startRun(c.env.DB, startedAt, feedCount);
    runId = run_id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[admin/collect] startRun failed: ${msg}`);
    return c.json({ error: "failed to start run" }, 500);
  }

  c.executionCtx.waitUntil(
    collectAll(c.env, { runId, feedIds }).catch((err) => {
      console.error("[admin/collect] collectAll failed", err);
    }),
  );

  return c.json<AdminCollectResponse>({ ok: true, run_id: runId, async: true });
});

app.post("/collector/run", async (c) => {
  if (c.env.READONLY === "1") {
    return c.json({ error: "read-only mode" }, 403);
  }
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

  // body が空 or 省略された場合は全 enabled feed を対象にする
  const rawBody = await c.req.text().catch(() => "");
  let feedIds: string[] | undefined;
  if (rawBody.trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return c.json({ error: "invalid JSON body" }, 400);
    }
    const body = parsed as Record<string, unknown>;
    if ("feed_ids" in body) {
      if (!Array.isArray(body.feed_ids)) {
        return c.json({ error: "feed_ids must be an array" }, 400);
      }
      feedIds = body.feed_ids as string[];
      // 存在しない feed_id が含まれていれば 400
      const allIds = new Set(loadAllFeeds().map((f) => f.id));
      const unknown = feedIds.filter((id) => !allIds.has(id));
      if (unknown.length > 0) {
        return c.json({ error: `unknown feed_ids: ${unknown.join(", ")}` }, 400);
      }
    }
  }

  const startedAt = new Date().toISOString();

  // 25s タイムアウト (Workers の cron 制限 30s に対して余裕を持たせる)
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);

  let collectResult: Awaited<ReturnType<typeof collectFeeds>>;
  try {
    const collectPromise = collectFeeds(c.env, feedIds);
    // AbortSignal が発火したら reject に落とす
    const abortPromise = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () =>
        reject(new Error("collector timed out after 25s")),
      );
    });
    collectResult = await Promise.race([collectPromise, abortPromise]);
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("timed out")) {
      return c.json({ error: "collector timed out (25s)" }, 504);
    }
    return c.json({ error: msg }, 500);
  }
  clearTimeout(timer);

  const finishedAt = new Date().toISOString();
  const results = collectResult.results.map((r) => ({
    feed_id: r.feedId,
    status: r.status,
    new_articles: r.inserted,
    ...(r.error !== undefined ? { error: r.error } : {}),
  }));

  return c.json<AdminCollectorRunResponse>({ started_at: startedAt, finished_at: finishedAt, results });
});

app.post("/feeds/:id/enabled", async (c) => {
  if (c.env.READONLY === "1") {
    return c.json({ error: "read-only mode" }, 403);
  }
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

  const body = await c.req.json().catch(() => null);
  if (!body || typeof (body as Record<string, unknown>).enabled !== "boolean") {
    return c.json({ error: "invalid body: enabled must be a boolean" }, 400);
  }
  const enabled = (body as { enabled: boolean }).enabled;

  const id = c.req.param("id");
  const { found } = await setFeedEnabled(c.env.DB, id, enabled);
  if (!found) {
    return c.json({ error: "feed not found" }, 404);
  }
  return c.json<AdminFeedEnabledResponse>({ id, enabled });
});

app.get("/runs", async (c) => {
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

  const limitParam = Number(c.req.query("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;
  const runs = await listRuns(c.env.DB, limit);
  return c.json<AdminRunListResponse>({ runs });
});

app.get("/runs/:id", async (c) => {
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

  const idParam = Number(c.req.param("id"));
  if (!Number.isFinite(idParam) || idParam <= 0) {
    return c.json({ error: "invalid id" }, 400);
  }
  const detail = await getRun(c.env.DB, idParam);
  if (!detail) {
    return c.json({ error: "run not found" }, 404);
  }

  const { run, feeds } = detail;
  // started_at / completed_at から duration_ms を計算する
  const duration_ms =
    run.completed_at !== null
      ? Math.round(new Date(run.completed_at).getTime() - new Date(run.started_at).getTime())
      : null;

  c.header("Cache-Control", "private, max-age=30");
  return c.json<AdminRunDetailResponse>({ run: { ...run, duration_ms }, feeds });
});

app.get("/feeds/diagnostics", async (c) => {
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

  const feeds = await getFeedsDiagnostics(c.env.DB);
  c.header("Cache-Control", "private, max-age=30");
  return c.json<AdminFeedsDiagnosticsResponse>({ feeds, count: feeds.length });
});

app.get("/cron-health", async (c) => {
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

  const daysParam = c.req.query("days") ?? "7";
  const daysNum = Number(daysParam);
  if (daysNum !== 7 && daysNum !== 30) {
    return c.json({ error: "days must be 7 or 30" }, 400);
  }
  const days = daysNum as 7 | 30;

  const [health, topFailingFeeds] = await Promise.all([
    getCronHealth(c.env.DB, days),
    getFeedFailures(c.env.DB, days, 10),
  ]);

  c.header("Cache-Control", "private, max-age=60");
  return c.json<AdminCronHealthResponse>({ ...health, top_failing_feeds: topFailingFeeds });
});

export default app;
