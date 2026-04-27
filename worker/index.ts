import { Hono } from "hono";
import type { Env } from "./types";
import api from "./api/router";
import { collectAll } from "./collector";

const app = new Hono<{ Bindings: Env }>();

app.route("/api", api);

// 静的アセットへのフォールバック (Cloudflare Static Assets binding)
app.all("*", async (c) => {
  return c.env.ASSETS.fetch(c.req.raw);
});

const handler: ExportedHandler<Env> = {
  fetch: app.fetch,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      collectAll(env).catch((err) => {
        console.error("[scheduled] collectAll failed", err);
      }),
    );
  },
};

export default handler;
