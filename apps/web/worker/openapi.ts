// OpenAPI 3.1 schema for the tech-news-bot API.
// This file is the single source of truth for /api/openapi.json.
// Keep it in sync with the actual route handlers in ./api/.

const openApiSchema = {
  openapi: "3.1.0",
  info: {
    title: "tech-news-bot API",
    description:
      "Big tech / AI / Japanese engineering blog aggregator. Collects RSS/Atom feeds every 3 hours and exposes them via REST and feed endpoints.",
    version: "1.0.0",
  },
  paths: {
    "/api/articles": {
      get: {
        summary: "List articles",
        description:
          "Returns articles in descending published_at order. Supports cursor-based pagination.",
        operationId: "listArticles",
        tags: ["articles"],
        parameters: [
          {
            name: "category",
            in: "query",
            description: "Filter by feed category",
            required: false,
            schema: { $ref: "#/components/schemas/FeedCategory" },
          },
          {
            name: "lang",
            in: "query",
            description: "Filter by article language",
            required: false,
            schema: { $ref: "#/components/schemas/FeedLang" },
          },
          {
            name: "feed_id",
            in: "query",
            description: "Filter by feed ID (kebab-case, must be a registered feed)",
            required: false,
            schema: { type: "string", example: "openai-blog" },
          },
          {
            name: "q",
            in: "query",
            description: "Full-text search query (SQLite FTS5)",
            required: false,
            schema: { type: "string", example: "transformer" },
          },
          {
            name: "limit",
            in: "query",
            description: "Number of articles to return (1–100, default 20)",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
          {
            name: "cursor",
            in: "query",
            description: "Opaque base64 cursor from the previous page's nextCursor field",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            description: "Paginated article list",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ArticlesResponse" },
              },
            },
          },
        },
      },
    },
    "/api/feeds": {
      get: {
        summary: "List feeds",
        description:
          "Returns all configured feeds merged with their database state (article count, last fetch status).",
        operationId: "listFeeds",
        tags: ["feeds"],
        responses: {
          "200": {
            description: "Feed list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["feeds"],
                  properties: {
                    feeds: {
                      type: "array",
                      items: { $ref: "#/components/schemas/FeedSummary" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/stats": {
      get: {
        summary: "Aggregated statistics",
        description:
          "Returns article counts by category and language, along with feeds that have not been fetched recently or have errors.",
        operationId: "getStats",
        tags: ["stats"],
        responses: {
          "200": {
            description: "Statistics",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatsResponse" },
              },
            },
          },
        },
      },
    },
    "/api/health": {
      get: {
        summary: "Health check",
        description: "Verifies D1 is reachable and returns the total article count.",
        operationId: "healthCheck",
        tags: ["health"],
        responses: {
          "200": {
            description: "Healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
          "500": {
            description: "Degraded (D1 unreachable)",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
              },
            },
          },
        },
      },
    },
    "/api/admin/collect": {
      post: {
        summary: "Trigger manual collection",
        description:
          "Runs the RSS/Atom collector for all enabled feeds immediately. Requires Bearer ADMIN_TOKEN.",
        operationId: "adminCollect",
        tags: ["admin"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Collection result",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CollectResult" },
              },
            },
          },
          "401": {
            description: "Unauthorized",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
          "503": {
            description: "ADMIN_TOKEN not configured",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
              },
            },
          },
        },
      },
    },
    "/feed.json": {
      get: {
        summary: "JSON Feed 1.1",
        description: "Latest articles in JSON Feed 1.1 format. Supports category and lang filters.",
        operationId: "jsonFeed",
        tags: ["syndication"],
        parameters: [
          {
            name: "category",
            in: "query",
            required: false,
            schema: { $ref: "#/components/schemas/FeedCategory" },
          },
          {
            name: "lang",
            in: "query",
            required: false,
            schema: { $ref: "#/components/schemas/FeedLang" },
          },
        ],
        responses: {
          "200": {
            description: "JSON Feed document",
            content: { "application/feed+json": { schema: { type: "object" } } },
          },
        },
      },
    },
    "/feed.xml": {
      get: {
        summary: "RSS 2.0",
        description: "Latest articles in RSS 2.0 format. Supports category and lang filters.",
        operationId: "rssFeed",
        tags: ["syndication"],
        parameters: [
          {
            name: "category",
            in: "query",
            required: false,
            schema: { $ref: "#/components/schemas/FeedCategory" },
          },
          {
            name: "lang",
            in: "query",
            required: false,
            schema: { $ref: "#/components/schemas/FeedLang" },
          },
        ],
        responses: {
          "200": {
            description: "RSS 2.0 document",
            content: { "application/rss+xml": { schema: { type: "string" } } },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "ADMIN_TOKEN secret (set via wrangler secret put)",
      },
    },
    schemas: {
      FeedCategory: {
        type: "string",
        enum: ["bigtech", "ai", "jp", "zenn"],
        description: "Feed category",
      },
      FeedLang: {
        type: "string",
        enum: ["ja", "en"],
        description: "Article language",
      },
      Article: {
        type: "object",
        required: [
          "id",
          "guid",
          "feed_id",
          "title",
          "url",
          "summary",
          "author",
          "published_at",
          "fetched_at",
          "category",
          "lang",
        ],
        properties: {
          id: { type: "integer" },
          guid: { type: "string" },
          feed_id: { type: "string" },
          feed_name: { type: "string" },
          title: { type: "string" },
          url: { type: "string", format: "uri" },
          summary: { type: ["string", "null"] },
          author: { type: ["string", "null"] },
          published_at: { type: "string", format: "date-time" },
          fetched_at: { type: "string", format: "date-time" },
          category: { $ref: "#/components/schemas/FeedCategory" },
          lang: { $ref: "#/components/schemas/FeedLang" },
        },
      },
      ArticlesResponse: {
        type: "object",
        required: ["articles", "nextCursor"],
        properties: {
          articles: {
            type: "array",
            items: { $ref: "#/components/schemas/Article" },
          },
          nextCursor: { type: ["string", "null"] },
        },
      },
      FeedSummary: {
        type: "object",
        required: [
          "id",
          "name",
          "url",
          "category",
          "lang",
          "enabled",
          "last_fetched_at",
          "last_status",
          "article_count",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          url: { type: "string", format: "uri" },
          category: { $ref: "#/components/schemas/FeedCategory" },
          lang: { $ref: "#/components/schemas/FeedLang" },
          enabled: { type: "boolean" },
          last_fetched_at: { type: ["string", "null"], format: "date-time" },
          last_status: { type: ["string", "null"] },
          article_count: { type: "integer", minimum: 0 },
        },
      },
      StaleFeed: {
        type: "object",
        required: ["id", "name", "last_status", "last_fetched_at", "last_error"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          last_status: { type: ["string", "null"] },
          last_fetched_at: { type: ["string", "null"], format: "date-time" },
          last_error: { type: ["string", "null"] },
        },
      },
      StatsResponse: {
        type: "object",
        required: [
          "total",
          "last_published_at",
          "last_fetched_at",
          "last24h",
          "by_category",
          "by_lang",
          "stale_feeds",
        ],
        properties: {
          total: { type: "integer" },
          last_published_at: { type: ["string", "null"], format: "date-time" },
          last_fetched_at: { type: ["string", "null"], format: "date-time" },
          last24h: { type: "integer" },
          by_category: {
            type: "object",
            additionalProperties: { type: "integer" },
          },
          by_lang: {
            type: "object",
            additionalProperties: { type: "integer" },
          },
          stale_feeds: {
            type: "array",
            items: { $ref: "#/components/schemas/StaleFeed" },
          },
        },
      },
      HealthResponse: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", enum: ["ok", "degraded"] },
          articles: { type: "integer" },
          error: { type: "string" },
        },
      },
      CollectResult: {
        type: "object",
        description: "Result of a manual collection run",
        additionalProperties: true,
      },
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
        },
      },
    },
  },
} as const;

export default openApiSchema;
