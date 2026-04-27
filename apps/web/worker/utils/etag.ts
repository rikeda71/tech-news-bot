import type { FeedCategory, FeedLang } from "../types";

export interface ArticlesEtagParams {
  category?: FeedCategory;
  lang?: FeedLang;
  feedId?: string;
  q?: string;
  limit: number;
  cursor?: string | null;
}

export interface SyndicationEtagParams {
  category?: FeedCategory;
  lang?: FeedLang;
}

// MAX(published_at) を取るだけの軽量クエリでリビジョンを取得する
async function fetchMaxPublishedAt(
  db: D1Database,
  conditions: string[],
  binds: (string | number)[],
): Promise<string> {
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const sql = `SELECT MAX(published_at) AS max_published FROM articles ${where}`;
  const row = await db
    .prepare(sql)
    .bind(...binds)
    .first<{ max_published: string | null }>();
  return row?.max_published ?? "";
}

async function sha256Hex16(input: string): Promise<string> {
  const encoded = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", encoded);
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}

function opt(value: string | number | null | undefined): string {
  return value != null ? String(value) : "";
}

export async function computeArticlesEtag(
  db: D1Database,
  feedsVersion: number,
  params: ArticlesEtagParams,
): Promise<string> {
  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (params.category) {
    conditions.push(`category = ?${binds.length + 1}`);
    binds.push(params.category);
  }
  if (params.lang) {
    conditions.push(`lang = ?${binds.length + 1}`);
    binds.push(params.lang);
  }
  if (params.feedId) {
    conditions.push(`feed_id = ?${binds.length + 1}`);
    binds.push(params.feedId);
  }

  const maxPublished = await fetchMaxPublishedAt(db, conditions, binds);
  const paramStr = [
    opt(params.category),
    opt(params.lang),
    opt(params.feedId),
    opt(params.q),
    opt(params.limit),
    opt(params.cursor),
  ].join("|");
  const source = `${maxPublished}|v${feedsVersion}|${paramStr}`;
  const hash = await sha256Hex16(source);
  return `W/"${hash}"`;
}

export async function computeSyndicationEtag(
  db: D1Database,
  feedsVersion: number,
  params: SyndicationEtagParams,
): Promise<string> {
  const conditions: string[] = [];
  const binds: (string | number)[] = [];

  if (params.category) {
    conditions.push(`category = ?${binds.length + 1}`);
    binds.push(params.category);
  }
  if (params.lang) {
    conditions.push(`lang = ?${binds.length + 1}`);
    binds.push(params.lang);
  }

  const maxPublished = await fetchMaxPublishedAt(db, conditions, binds);
  const paramStr = [opt(params.category), opt(params.lang)].join("|");
  const source = `${maxPublished}|v${feedsVersion}|${paramStr}`;
  const hash = await sha256Hex16(source);
  return `W/"${hash}"`;
}
