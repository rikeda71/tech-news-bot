import type { Env, FeedCategory } from "../types";
import { getArticleById } from "../db/articles";
import { findFeedWithStats } from "../db/feeds";

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

const SITE_NAME = "Tech News Bot";
const DEFAULT_DESCRIPTION = "海外 big tech / AI / 国内企業の tech blog 記事を集約";
const DYNAMIC_CACHE_CONTROL = "public, max-age=300, s-maxage=300, stale-while-revalidate=86400";

const CATEGORY_LABELS: Record<FeedCategory, string> = {
  bigtech: "ビッグテック",
  ai: "AI",
  jp: "日本企業",
  personal: "個人ブログ",
};

// ---------------------------------------------------------------------------
// Route 判別
// ---------------------------------------------------------------------------

type RouteMatch =
  | { type: "article"; id: number }
  | { type: "feed"; feedId: string }
  | { type: "author"; author: string }
  | { type: "category"; category: FeedCategory }
  | { type: "static" };

function matchRoute(pathname: string): RouteMatch {
  // /articles/:id
  const articleM = pathname.match(/^\/articles\/(\d+)$/);
  if (articleM) {
    const id = Number(articleM[1]);
    if (Number.isInteger(id) && id > 0) return { type: "article", id };
  }

  // /feed/:feedId (クライアントルーティングのパス)
  const feedM = pathname.match(/^\/feed\/(.+)$/);
  if (feedM) {
    const feedId = decodeURIComponent(feedM[1]).trim();
    if (feedId) return { type: "feed", feedId };
  }

  // /author/:author
  const authorM = pathname.match(/^\/author\/(.+)$/);
  if (authorM) {
    const author = decodeURIComponent(authorM[1]).trim();
    if (author) return { type: "author", author };
  }

  // /by-category/:cat — issue の設計方針に合わせて /by-category/:cat を採用
  const catM = pathname.match(/^\/by-category\/(.+)$/);
  if (catM) {
    const cat = catM[1] as FeedCategory;
    if (cat in CATEGORY_LABELS) return { type: "category", category: cat };
  }

  return { type: "static" };
}

// ---------------------------------------------------------------------------
// XSS 対策: HTML エスケープ (D1 由来の文字列を安全に属性値 / テキストに埋める)
// ---------------------------------------------------------------------------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------------------------------------------------
// HTMLRewriter によるメタタグ書き換え
// ---------------------------------------------------------------------------

interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  ogType: "article" | "website";
}

/**
 * HTMLRewriter を使って index.html の <title> / <meta> / OGP / Twitter card を書き換える。
 * 既存タグは属性を上書きし、不足タグは </head> 直前に追加する。
 */
function applyMetaRewriter(response: Response, meta: PageMeta): Response {
  // 書き換え済みフラグ (クロージャで複数ハンドラ間で共有)
  let canonicalDone = false;
  let ogTitleDone = false;
  let ogDescDone = false;
  let ogTypeDone = false;
  let ogUrlDone = false;
  let ogSiteNameDone = false;
  let twitterCardDone = false;
  let twitterTitleDone = false;
  let twitterDescDone = false;

  return new HTMLRewriter()
    .on("title", {
      element(el) {
        el.setInnerContent(escapeHtml(meta.title), { html: true });
      },
    })
    .on("meta", {
      element(el) {
        const name = el.getAttribute("name");
        const prop = el.getAttribute("property");

        if (name === "description") {
          el.setAttribute("content", escapeHtml(meta.description));
        } else if (name === "twitter:card") {
          el.setAttribute("content", "summary");
          twitterCardDone = true;
        } else if (name === "twitter:title") {
          el.setAttribute("content", escapeHtml(meta.title));
          twitterTitleDone = true;
        } else if (name === "twitter:description") {
          el.setAttribute("content", escapeHtml(meta.description));
          twitterDescDone = true;
        } else if (prop === "og:title") {
          el.setAttribute("content", escapeHtml(meta.title));
          ogTitleDone = true;
        } else if (prop === "og:description") {
          el.setAttribute("content", escapeHtml(meta.description));
          ogDescDone = true;
        } else if (prop === "og:type") {
          el.setAttribute("content", meta.ogType);
          ogTypeDone = true;
        } else if (prop === "og:url") {
          el.setAttribute("content", escapeHtml(meta.canonical));
          ogUrlDone = true;
        } else if (prop === "og:site_name") {
          el.setAttribute("content", escapeHtml(SITE_NAME));
          ogSiteNameDone = true;
        }
      },
    })
    .on("link", {
      element(el) {
        if (el.getAttribute("rel") === "canonical") {
          el.setAttribute("href", escapeHtml(meta.canonical));
          canonicalDone = true;
        }
      },
    })
    .on("head", {
      element(el) {
        // </head> の直前 (= 子要素がすべて処理済みの時点) に不足しているタグを追加する。
        // element() コールバックは <head> 開始タグ検出時に呼ばれるため、その時点では
        // 子の <meta> ハンドラがまだ実行されておらず *Done フラグが立っていない。
        // onEndTag() を使うことでチャイルドハンドラ完了後に評価できる。
        el.onEndTag((endTag) => {
          const missing: string[] = [];

          if (!canonicalDone) {
            missing.push(`<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`);
          }
          if (!ogTitleDone) {
            missing.push(`<meta property="og:title" content="${escapeHtml(meta.title)}" />`);
          }
          if (!ogDescDone) {
            missing.push(
              `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
            );
          }
          if (!ogTypeDone) {
            missing.push(`<meta property="og:type" content="${meta.ogType}" />`);
          }
          if (!ogUrlDone) {
            missing.push(`<meta property="og:url" content="${escapeHtml(meta.canonical)}" />`);
          }
          if (!ogSiteNameDone) {
            missing.push(`<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`);
          }
          if (!twitterCardDone) {
            missing.push(`<meta name="twitter:card" content="summary" />`);
          }
          if (!twitterTitleDone) {
            missing.push(`<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`);
          }
          if (!twitterDescDone) {
            missing.push(
              `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
            );
          }

          if (missing.length > 0) {
            endTag.before(`\n    ${missing.join("\n    ")}\n  `, { html: true });
          }
        });
      },
    })
    .transform(response);
}

// ---------------------------------------------------------------------------
// メタ情報の解決
// ---------------------------------------------------------------------------

type MetaResult = { status: "ok"; meta: PageMeta } | { status: "fallback" };

async function resolveMeta(route: RouteMatch, req: Request, env: Env): Promise<MetaResult> {
  const origin = new URL(req.url).origin;

  if (route.type === "article") {
    try {
      const article = await getArticleById(env.DB, route.id);
      if (!article) return { status: "fallback" };

      const title = `${article.title} | ${SITE_NAME}`;
      const description = article.summary ? article.summary.slice(0, 200) : DEFAULT_DESCRIPTION;
      const canonical = `${origin}/articles/${article.id}`;
      return { status: "ok", meta: { title, description, canonical, ogType: "article" } };
    } catch {
      return { status: "fallback" };
    }
  }

  if (route.type === "feed") {
    try {
      const feed = await findFeedWithStats(env.DB, route.feedId);
      if (!feed) return { status: "fallback" };

      const title = `${feed.name} | ${SITE_NAME}`;
      const canonical = `${origin}/feed/${encodeURIComponent(feed.id)}`;
      return {
        status: "ok",
        meta: { title, description: DEFAULT_DESCRIPTION, canonical, ogType: "website" },
      };
    } catch {
      return { status: "fallback" };
    }
  }

  if (route.type === "author") {
    const title = `${route.author} の記事 | ${SITE_NAME}`;
    const canonical = `${origin}/author/${encodeURIComponent(route.author)}`;
    return {
      status: "ok",
      meta: { title, description: DEFAULT_DESCRIPTION, canonical, ogType: "website" },
    };
  }

  if (route.type === "category") {
    const label = CATEGORY_LABELS[route.category];
    const title = `${label} の記事 | ${SITE_NAME}`;
    const canonical = `${origin}/by-category/${route.category}`;
    return {
      status: "ok",
      meta: { title, description: DEFAULT_DESCRIPTION, canonical, ogType: "website" },
    };
  }

  return { status: "fallback" };
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function withCacheControl(res: Response, value: string): Response {
  const headers = new Headers(res.headers);
  headers.set("Cache-Control", value);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// ---------------------------------------------------------------------------
// エントリポイント
// ---------------------------------------------------------------------------

/**
 * SPA fallback 用の HTMLRewriter によるメタ書き換え。
 * - `/api/*` と `/assets/*` はこの関数を経由しない (index.ts で先に処理される)
 * - route 不明 / D1 失敗 → 静的 index.html をそのまま返す (200, no rewriting)
 * - 成功時は meta を書き換えて Cache-Control: public, max-age=300 を付与する
 */
export async function rewriteShell(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const route = matchRoute(url.pathname);

  // 静的 fallback は書き換えせずそのまま返す
  if (route.type === "static") {
    const res = await env.ASSETS.fetch(req);
    return withCacheControl(res, "no-cache, must-revalidate");
  }

  // メタ情報を解決する
  const result = await resolveMeta(route, req, env);
  if (result.status === "fallback") {
    const res = await env.ASSETS.fetch(req);
    return withCacheControl(res, "no-cache, must-revalidate");
  }

  // HTMLRewriter で index.html を書き換える
  const assetsRes = await env.ASSETS.fetch(req);
  const rewritten = applyMetaRewriter(assetsRes, result.meta);

  const headers = new Headers(rewritten.headers);
  headers.set("Cache-Control", DYNAMIC_CACHE_CONTROL);
  return new Response(rewritten.body, {
    status: rewritten.status,
    statusText: rewritten.statusText,
    headers,
  });
}
