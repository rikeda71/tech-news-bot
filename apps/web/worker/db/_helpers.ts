/**
 * 現在時刻から `days` 日前の ISO 8601 文字列を返す。
 * 用途: D1 クエリで `WHERE published_at > ?` の閾値計算など。
 */
export function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}
