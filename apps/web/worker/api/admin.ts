import { Hono } from "hono";
import type { Env } from "../types";
import { collectAll } from "../collector";
import { setFeedEnabled } from "../db/feeds";

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

export default app;
