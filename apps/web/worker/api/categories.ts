import { Hono } from "hono";
import type { Env } from "../types";
import { getCategoriesSummary } from "../db/feeds";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  const categories = await getCategoriesSummary(c.env.DB);
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ categories });
});

export default app;
