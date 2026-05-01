/**
 * 現在時刻から `days` 日前の ISO 8601 文字列を返す。
 * 用途: D1 クエリで `WHERE published_at > ?` の閾値計算など。
 */
export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/**
 * D1Result<unknown> から rows を T[] として取り出す。
 * db.batch() は単一型 T しか受け付けないため、各 result の .results を
 * 個別にキャストする必要がある。D1 という外部入力境界でのアサーションを
 * この helper に集約し、呼び出し側のコードをクリーンに保つ。
 */
export function rowsAs<T>(result: D1Result): T[] {
  return (result.results ?? []) as T[];
}
