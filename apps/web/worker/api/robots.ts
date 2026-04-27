import { Hono } from "hono";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();

app.get("/robots.txt", (c) => {
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;
  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/admin/",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
  ].join("\n");
  c.header("Content-Type", "text/plain; charset=utf-8");
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(body);
});

export default app;
