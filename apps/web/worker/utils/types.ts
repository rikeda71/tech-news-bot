/**
 * worker 全体で再利用できる型ユーティリティを集約する。
 * 汎用ロジックはここに置き、特定ドメイン専用の型は types.ts に置く。
 */

/**
 * union 型の type guard factory。
 * `includes` を `string[]` へ unsafe キャストせずに使えるよう、
 * 正当な値の配列から型を絞り込む。
 *
 * @example
 *   const isCategory = makeOneOf<FeedCategory>(["bigtech", "ai", "jp", "personal"]);
 *   if (isCategory(raw)) { ... } // raw は FeedCategory として利用可能
 */
export function makeOneOf<T extends string>(
  values: readonly T[],
): (value: string | undefined | null) => value is T {
  const set = new Set<string>(values);
  return (value): value is T => typeof value === "string" && set.has(value);
}
