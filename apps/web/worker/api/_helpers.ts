/**
 * limit クエリパラメータを解析して clamp した整数を返す。
 * 数値として無効な値 (NaN, Infinity) はデフォルト値にフォールバックする。
 */
export function parseLimit(
  raw: string | undefined,
  opts: { default: number; max: number; min?: number },
): number {
  // 空文字列も "未指定" として扱う (Number("") は 0 になり意図せず min に丸まるため)
  if (raw === undefined || raw === "") return opts.default;
  const min = opts.min ?? 1;
  const n = Number(raw);
  if (!Number.isFinite(n)) return opts.default;
  return Math.min(Math.max(n, min), opts.max);
}

/**
 * 正の整数文字列を解析する。0・負・NaN・Infinity など無効な場合は null を返す。
 * URL パラメータ (:id) の解析に使う。
 */
export function parsePositiveInt(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) return null;
  return n;
}
