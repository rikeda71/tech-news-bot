/**
 * D1 結果の category / lang 列を検証する型ガード。
 * DB に想定外の値が入っていた場合に console.warn して安全な fallback 値に倒す。
 *
 * api/_guards.ts と同様のロジックだが、db 層 (feeds.ts / feed-stats.ts) の
 * 2 ファイルから使うため、01-typescript.md の「1 ディレクトリ内の 2-3 ファイル →
 * そのディレクトリ内に <domain>.ts を作る」ルールに従いここに配置する。
 */

import type { FeedCategory, FeedLang } from "../types";

const VALID_CATEGORIES = new Set<string>(["bigtech", "ai", "jp", "personal"]);
const VALID_LANGS = new Set<string>(["ja", "en"]);

export function isCategory(value: unknown): value is FeedCategory {
  return typeof value === "string" && VALID_CATEGORIES.has(value);
}

export function isLang(value: unknown): value is FeedLang {
  return typeof value === "string" && VALID_LANGS.has(value);
}

/**
 * D1 結果の category 列を検証して FeedCategory を返す。
 * 不正値の場合は console.warn して "bigtech" を fallback として返す。
 * "bigtech" は FeedCategory の最初の定義値で、既知の安全な値。
 */
export function parseCategory(raw: unknown, context?: string): FeedCategory {
  if (isCategory(raw)) return raw;
  console.warn(
    `[db/_guards] unexpected category value: ${JSON.stringify(raw)}${context ? ` (${context})` : ""}. Falling back to "bigtech".`,
  );
  return "bigtech";
}

/**
 * D1 結果の lang 列を検証して FeedLang を返す。
 * 不正値の場合は console.warn して "en" を fallback として返す。
 */
export function parseLang(raw: unknown, context?: string): FeedLang {
  if (isLang(raw)) return raw;
  console.warn(
    `[db/_guards] unexpected lang value: ${JSON.stringify(raw)}${context ? ` (${context})` : ""}. Falling back to "en".`,
  );
  return "en";
}
