import { Hono } from "hono";
import type { Env } from "../types";
import { getReport, isReportKind, listReports } from "../db/reports";
import type { ReportKind } from "../db/reports";
import type { AdminReportDetailResponse, AdminReportListResponse } from "./types";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  const kindParam = c.req.query("kind");
  let kind: ReportKind | undefined;
  if (kindParam !== undefined) {
    if (!isReportKind(kindParam)) {
      return c.json({ error: "kind must be one of: daily | weekly | monthly" }, 400);
    }
    kind = kindParam;
  }

  const limitParam = Number(c.req.query("limit") ?? "20");
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 20;

  const reports = await listReports(c.env.DB, { kind, limit });
  return c.json<AdminReportListResponse>({ reports }, 200, {
    "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
  });
});

app.get("/:id", async (c) => {
  const idParam = Number(c.req.param("id"));
  if (!Number.isFinite(idParam) || idParam <= 0) {
    return c.json({ error: "invalid id" }, 400);
  }
  const detail = await getReport(c.env.DB, idParam);
  if (!detail) {
    return c.json({ error: "report not found" }, 404);
  }
  return c.json<AdminReportDetailResponse>({ report: detail }, 200, {
    "Cache-Control": "public, max-age=600, stale-while-revalidate=1800",
  });
});

export default app;
