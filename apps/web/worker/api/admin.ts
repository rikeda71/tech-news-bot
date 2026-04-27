import { Hono } from "hono";
import type { Env } from "../types";
import { collectAll } from "../collector";

const app = new Hono<{ Bindings: Env }>();

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

app.post("/collect", async (c) => {
  const expected = (c.env as unknown as { ADMIN_TOKEN?: string }).ADMIN_TOKEN;
  if (!expected) {
    return c.json({ error: "ADMIN_TOKEN is not configured" }, 503);
  }
  const auth = c.req.header("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || !timingSafeEqual(token, expected)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const result = await collectAll(c.env);
  return c.json(result);
});

export default app;
