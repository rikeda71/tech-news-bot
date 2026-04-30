/**
 * collector モジュール共通の型定義とエラー分類ロジック。
 * feedWriter / index の双方から import できるよう循環依存を避けて独立させた。
 */

/**
 * エラーの種別。alert や監視ダッシュボードでエラーをフィルタリングできるよう型で区別する。
 * - timeout: AbortError (fetchFeed のタイムアウト)
 * - network: TypeError (DNS 解決失敗・接続拒否など)
 * - http_client: HTTP 4xx (404, 403 など恒久エラー)
 * - http_server: HTTP 5xx / 429 (一時障害。リトライ後も失敗した場合)
 * - parse: XML パース失敗または空フィード
 * - unknown: 上記に分類できないエラー
 */
export type CollectErrorKind =
  | "timeout"
  | "network"
  | "http_client"
  | "http_server"
  | "parse"
  | "unknown";

/** discriminated union: status に応じて error / errorKind フィールドの有無が変わる */
export type CollectResult =
  | { feedId: string; status: "ok"; inserted: number; parsed: number }
  | { feedId: string; status: "not_modified"; inserted: number; parsed: number }
  | {
      feedId: string;
      status: "error";
      inserted: number;
      parsed: number;
      error: string;
      errorKind: CollectErrorKind;
    };

export interface CollectAllResult {
  total: number;
  inserted: number;
  pruned: number;
  results: CollectResult[];
  durationMs: number;
}

/**
 * 例外からエラー種別を分類する。
 * isRetryableError と対になる分類で、同じ判定ロジックを使う。
 */
export function classifyError(err: unknown): CollectErrorKind {
  if (!(err instanceof Error)) return "unknown";
  if (err.name === "AbortError") return "timeout";
  if (err instanceof TypeError) return "network";
  const m = /^HTTP (\d+)/.exec(err.message);
  if (m) {
    const code = Number(m[1]);
    if (code === 429 || (code >= 500 && code < 600)) return "http_server";
    if (code >= 400 && code < 500) return "http_client";
  }
  return "unknown";
}
