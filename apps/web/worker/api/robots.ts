import { Hono } from "hono";
import { AI_TRAINING_BOT_TOKENS } from "../middleware/ai-crawler-block";
import type { Env } from "../types";

const app = new Hono<{ Bindings: Env }>();

app.get("/robots.txt", (c) => {
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;

  const aiBlocks = AI_TRAINING_BOT_TOKENS.map((token) => `User-agent: ${token}\nDisallow: /`).join(
    "\n\n",
  );

  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/admin/",
    "",
    aiBlocks,
    "",
    `Sitemap: ${origin}/sitemap.xml`,
  ].join("\n");

  c.header("Content-Type", "text/plain; charset=utf-8");
  // robots.txt の内容は静的なためエッジキャッシュを積極活用する。
  // stale-while-revalidate でキャッシュ切れ後も裏でリフレッシュしつつ即返せる。
  c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  return c.body(body);
});

export default app;
