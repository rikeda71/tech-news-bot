import { Hono } from "hono";
import type { Env } from "../types";
import { collectAll, collectFeeds } from "../collector";
import { loadAllFeeds } from "../feed-config";
import { setFeedEnabled } from "../db/feeds";
import { getRun, listRuns } from "../db/runs";

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
  const result = await collectAll(c.env);
  return c.json(result);
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

  return c.json({ started_at: startedAt, finished_at: finishedAt, results });
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
  return c.json({ id, enabled });
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
  return c.json({ runs });
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
    return c.json({ error: "not found" }, 404);
  }
  return c.json(detail);
});

export default app;
