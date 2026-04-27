import { Hono } from "hono";
import { getHealthSummary } from "../db/health";
import type { Env, HealthResponse } from "../types";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  try {
    const db = await getHealthSummary(c.env.DB);
    const body: HealthResponse = {
      status: "ok",
      now: new Date().toISOString(),
      db,
    };
    c.header("Cache-Control", "public, max-age=10");
    return c.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ status: "degraded", error: message }, 500);
  }
});

export default app;
