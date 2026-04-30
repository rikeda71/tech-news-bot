import type { FeedCategory, FeedLang } from "../types";

export const VALID_CATEGORIES = [
  "bigtech",
  "ai",
  "jp",
  "personal",
] as const satisfies readonly FeedCategory[];
export type Category = (typeof VALID_CATEGORIES)[number];

export const VALID_LANGS = ["ja", "en"] as const satisfies readonly FeedLang[];
export type Lang = (typeof VALID_LANGS)[number];

// unknown を受け取れるよう定義することで、URL パラメータ (string | null | undefined) と
// リクエスト body のフィールド (unknown) の両方から呼び出せる。
const _categorySet = new Set<string>(VALID_CATEGORIES);
const _langSet = new Set<string>(VALID_LANGS);

export function isCategory(value: unknown): value is FeedCategory {
  return typeof value === "string" && _categorySet.has(value);
}

export function isLang(value: unknown): value is FeedLang {
  return typeof value === "string" && _langSet.has(value);
}
