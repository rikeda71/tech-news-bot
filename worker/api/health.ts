import { Hono } from "hono";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  try {
    const r = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM articles").first<{ n: number }>();
    return c.json({ status: "ok", articles: r?.n ?? 0 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ status: "degraded", error: message }, 500);
  }
});

export default app;
