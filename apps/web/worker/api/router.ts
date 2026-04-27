import { Hono } from "hono";
import type { Env } from "../types";
import articles from "./articles";
import feeds from "./feeds";
import health from "./health";
import stats from "./stats";
import admin from "./admin";

const api = new Hono<{ Bindings: Env }>();

api.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});

api.route("/articles", articles);
api.route("/feeds", feeds);
api.route("/health", health);
api.route("/stats", stats);
api.route("/admin", admin);

export default api;
