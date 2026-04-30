import type { FeedCategory, FeedLang } from "../types/api";

// カテゴリ / 言語の有効値を一元管理するモジュール。
// worker 側の _guards.ts は依存方向の都合上 import できないため、
// client 専用の集約モジュールとして定義する。

export const FEED_CATEGORIES = [
  "bigtech",
  "ai",
  "jp",
  "personal",
] as const satisfies readonly FeedCategory[];

export const FEED_LANGS = ["ja", "en"] as const satisfies readonly FeedLang[];

// readonly string[] 型にしてから includes で比較するため、
// FeedCategory / FeedLang の string への拡張は satisfies で保証済みのため安全。
const FEED_CATEGORIES_STR: readonly string[] = FEED_CATEGORIES;
const FEED_LANGS_STR: readonly string[] = FEED_LANGS;

/** 文字列が有効な FeedCategory かを判定する型ガード */
export function isFeedCategory(value: unknown): value is FeedCategory {
  return typeof value === "string" && FEED_CATEGORIES_STR.includes(value);
}

/** 文字列が有効な FeedLang かを判定する型ガード */
export function isFeedLang(value: unknown): value is FeedLang {
  return typeof value === "string" && FEED_LANGS_STR.includes(value);
}
