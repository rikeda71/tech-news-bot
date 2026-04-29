import type { Article } from "../../types";

/**
 * 各 renderer に渡すフィードメタ情報。
 * articles → items 変換は renderer 内で完結させるため、articles を直接保持する。
 */
export interface FeedMeta {
  /** フィードのタイトル */
  title: string;
  /** フィードの説明文 */
  description: string;
  /**
   * language タグ / フィールドに使う言語コード。
   * undefined の場合は RSS/JSON それぞれで "und" または省略。
   */
  language: string | undefined;
  /** フィード自身の URL */
  feedUrl: string;
  /** サイトの origin (例: https://example.com) */
  origin: string;
  /** リクエスト URL の hostname (Atom の id タグに使用) */
  hostname: string;
  /** リクエスト URL の pathname (Atom の id タグに使用) */
  feedPath: string;
  /** 現在の西暦年 (Atom の id タグに使用) */
  year: number;
  /** 記事一覧 */
  articles: Article[];
}

export function escapeXml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function toRfc822(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toUTCString();
  return d.toUTCString();
}

export function siteOrigin(reqUrl: string): string {
  try {
    const u = new URL(reqUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

/** リクエスト URL から FeedMeta の共通フィールドを構築するヘルパー */
export function buildUrlParts(reqUrl: string): {
  origin: string;
  feedUrl: string;
  feedPath: string;
  hostname: string;
  year: number;
} {
  const u = new URL(reqUrl);
  return {
    origin: siteOrigin(reqUrl),
    feedUrl: u.toString(),
    feedPath: u.pathname,
    hostname: u.hostname || "example.com",
    year: new Date().getFullYear(),
  };
}
