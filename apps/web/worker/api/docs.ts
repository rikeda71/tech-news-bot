import { Hono } from "hono";
import type { Env } from "../types";
import openApiSchema from "../openapi";

const app = new Hono<{ Bindings: Env }>();

app.get("/openapi.json", (c) => {
  return c.json(openApiSchema);
});

// Scalar API Reference UI — loaded via CDN, no npm dep needed.
// CSP on /api/docs is loosened so the CDN script can execute.
app.get("/docs", (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>tech-news-bot API Reference</title>
</head>
<body>
  <script
    id="api-reference"
    data-url="/api/openapi.json"
    src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`;

  // Override CSP so Scalar's CDN script can load and run.
  c.header(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' https://cdn.jsdelivr.net 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: https:",
      "connect-src 'self' https://cdn.jsdelivr.net",
      "frame-ancestors 'none'",
      "base-uri 'self'",
    ].join("; "),
  );
  c.header("Content-Type", "text/html; charset=utf-8");
  return c.body(html);
});

export default app;
