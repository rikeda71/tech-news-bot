import type { Context } from "hono";
import type { Env } from "../types";

type Auth = "none" | "admin";

interface EndpointEntry {
  method: string;
  path: string;
  description: string;
  auth: Auth;
}

interface SyndicationEntry {
  path: string;
  format: string;
}

interface CatalogResponse {
  name: string;
  version: string;
  description: string;
  endpoints: EndpointEntry[];
  syndication: SyndicationEntry[];
  docs_url: string;
}

const CATALOG: CatalogResponse = {
  name: "tech-news-bot API",
  version: "1.0",
  description: "Tech blog RSS/Atom aggregator API running on Cloudflare Workers",
  endpoints: [
    {
      method: "GET",
      path: "/api/articles",
      description: "記事一覧 (cursor pagination)",
      auth: "none",
    },
    {
      method: "GET",
      path: "/api/articles/:guid/related",
      description: "関連記事",
      auth: "none",
    },
    {
      method: "GET",
      path: "/api/articles/:guid/neighbors",
      description: "前後の記事",
      auth: "none",
    },
    {
      method: "GET",
      path: "/api/articles/by-author/:author",
      description: "著者別記事 (cursor pagination)",
      auth: "none",
    },
    {
      method: "GET",
      path: "/api/articles/by-feed/:feedId",
      description: "フィード別記事 (cursor pagination)",
      auth: "none",
    },
    {
      method: "GET",
      path: "/api/articles/calendar",
      description: "日別記事数 (heatmap data)",
      auth: "none",
    },
    {
      method: "GET",
      path: "/api/articles/random",
      description: "ランダム記事",
      auth: "none",
    },
    {
      method: "GET",
      path: "/api/articles/archive",
      description: "月別アーカイブ",
      auth: "none",
    },
    {
      method: "GET",
      path: "/api/articles/:id",
      description: "記事 1 件",
      auth: "none",
    },
    {
      method: "GET",
      path: "/api/feeds",
      description: "フィード一覧 + 30d 統計",
      auth: "none",
    },
    {
      method: "GET",
      path: "/api/feeds/:id",
      description: "フィード詳細 + 直近記事",
      auth: "none",
    },
    {
      method: "GET",
      path: "/api/categories",
      description: "カテゴリ別サマリ",
      auth: "none",
    },
    {
      method: "GET",
      path: "/api/stats",
      description: "統計情報",
      auth: "none",
    },
    {
      method: "GET",
      path: "/api/health",
      description: "ヘルスチェック",
      auth: "none",
    },
    {
      method: "POST",
      path: "/api/admin/collect",
      description: "手動収集トリガ",
      auth: "admin",
    },
    {
      method: "POST",
      path: "/api/admin/feeds/:id/enabled",
      description: "フィード ON/OFF",
      auth: "admin",
    },
    {
      method: "POST",
      path: "/api/admin/feeds/validate",
      description: "フィード URL 検証",
      auth: "admin",
    },
    {
      method: "GET",
      path: "/api/admin/runs",
      description: "Cron 実行履歴",
      auth: "admin",
    },
    {
      method: "GET",
      path: "/api/admin/cron-health",
      description: "Cron 運用メトリクス",
      auth: "admin",
    },
    {
      method: "GET",
      path: "/api/admin/feeds/diagnostics",
      description: "フィード診断",
      auth: "admin",
    },
  ],
  syndication: [
    { path: "/feeds.json", format: "JSON Feed v1.1" },
    { path: "/feeds.xml", format: "RSS 2.0" },
    { path: "/feeds.atom", format: "Atom 1.0" },
    {
      path: "/feeds/category/:cat.{xml,json,atom}",
      format: "RSS / JSON Feed / Atom (category)",
    },
    {
      path: "/feeds/lang/:lang.{xml,json,atom}",
      format: "RSS / JSON Feed / Atom (lang)",
    },
    {
      path: "/feeds/author/:author.{xml,json,atom}",
      format: "RSS / JSON Feed / Atom (author)",
    },
    { path: "/feeds.opml", format: "OPML 2.0" },
  ],
  docs_url: "https://github.com/rikeda71/tech-news-bot",
};

// 変更頻度が低いため長めのキャッシュを設定する
export function catalogHandler(c: Context<{ Bindings: Env }>) {
  c.header("Cache-Control", "public, max-age=3600");
  return c.json(CATALOG);
}
