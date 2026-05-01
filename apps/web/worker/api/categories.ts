import { Hono } from "hono";
import type { Env } from "../types";
import { getCategoriesSummary } from "../db/feed-stats";
import type { CategoriesResponse } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  const categories = await getCategoriesSummary(c.env.DB);
  c.header("Cache-Control", "public, max-age=300");
  return c.json<CategoriesResponse>({ categories });
});

export default app;
