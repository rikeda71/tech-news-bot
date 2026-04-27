import { Hono } from "hono";
import { getHealthSummary } from "../db/health";
import { getFeedHealth } from "../db/feeds";
import { loadAllFeeds } from "../feed-config";
import type { Env, FeedHealth, HealthResponse } from "../types";

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

// feeds.yaml の全フィードに対してヘルス情報 (最終成功/失敗時刻・連続失敗数・直近7日記事数) を返す。
app.get("/feeds", async (c) => {
  try {
    const configFeeds = loadAllFeeds();
    const health: FeedHealth[] = await getFeedHealth(c.env.DB, configFeeds);
    c.header("Cache-Control", "public, max-age=60");
    return c.json(health);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ status: "degraded", error: message }, 500);
  }
});

export default app;
