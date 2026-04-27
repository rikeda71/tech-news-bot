import { Hono } from "hono";
import type { Env } from "../types";
import openApiSchema from "../openapi";

const app = new Hono<{ Bindings: Env }>();

app.get("/openapi.json", (c) => {
  return c.json(openApiSchema);
});

const SWAGGER_UI_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>tech-news-bot API Docs</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/api/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis]
    });
  </script>
</body>
</html>`;

app.get("/docs", (c) =>
  c.html(SWAGGER_UI_HTML, 200, {
    "Cache-Control": "public, max-age=86400, immutable",
  }),
);

export default app;
