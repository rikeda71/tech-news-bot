/**
 * articles.ts handler で使う HTTP request parse helper (Context 依存あり)。
 * limit / cursor などのクエリパラメータ parse と validation を集約し、handler を薄く保つ。
 *
 * isCategory / isLang の guard は _guards.ts に集約されている。
 * articles.ts では _guards.ts から import して利用する。
 */
import type { Context } from "hono";
import type { Env } from "../types";
import type { Cursor } from "../db/articles";

// ISO 8601 の日時部分 (時刻まで)。decodeCursor の publishedAt 検証と
// since/until の ISO 形式チェック (時刻部分以降は内部で 10 文字に切り詰めて検証) に共用する。
export const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
// YYYY-MM-DD 形式のみ受け付ける (末尾 anchor で `9999-99-99foo` のような余剰文字を排除)
const DATE_RANGE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 実日付として妥当か検証する。Date が内部で繰り上げる (9999-99-99 → 3000-03-09 等) ことを
// 再フォーマットして入力文字列と比較することで検出する。
function isValidDate(s: string): boolean {
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t)) return false;
  const d = new Date(t);
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}` === s;
}

/**
 * 日付範囲パラメータの形式 + 実日付チェック。
 * 未指定 (undefined) は OK として true を返す。
 * YYYY-MM-DD / YYYY-MM-DDTHH:MM:SS... 形式のみ受け付ける。
 */
export function isValidDateRange(s: string | undefined): boolean {
  if (!s) return true; // 未指定は OK
  // YYYY-MM-DD 形式: 実日付として妥当かチェック
  if (DATE_RANGE_RE.test(s)) return isValidDate(s);
  // YYYY-MM-DDTHH:MM:SS... 形式: 先頭の日付部分のみ抽出して検証
  if (ISO_DATETIME_RE.test(s)) return isValidDate(s.slice(0, 10));
  return false;
}

/**
 * unknown 値が Cursor 形状を持つか検証する type guard。
 * publishedAt / id それぞれを narrow して型を保証する。
 */
function isCursorShape(v: unknown): v is Cursor {
  if (v === null || typeof v !== "object") return false;
  const rec = v as Record<string, unknown>;
  if (typeof rec.publishedAt !== "string") return false;
  if (!ISO_DATETIME_RE.test(rec.publishedAt)) return false;
  if (typeof rec.id !== "number") return false;
  if (!Number.isInteger(rec.id)) return false;
  if (rec.id < 0) return false;
  return true;
}

/**
 * Base64 エンコードされた cursor 文字列を Cursor オブジェクトに変換する。
 * 不正な入力 (不正 base64 / JSON / 必須フィールド欠落 / 型不正) の場合は null を返す。
 */
export function decodeCursor(input: string | undefined): Cursor | null {
  if (!input) return null;
  try {
    const decoded = atob(input);
    const parsed: unknown = JSON.parse(decoded);
    if (isCursorShape(parsed)) {
      return { publishedAt: parsed.publishedAt, id: parsed.id };
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Cursor オブジェクトを Base64 エンコードした文字列に変換する。
 * null が渡された場合は null を返す。
 */
export function encodeCursor(cursor: { publishedAt: string; id: number } | null): string | null {
  if (!cursor) return null;
  return btoa(JSON.stringify(cursor));
}

export type ParsedListQuery =
  | { ok: true; limit: number; cursor: Cursor | null }
  | { ok: false; response: Response };

/**
 * limit / cursor の parse + 400 チェックを共通化。
 * エラーメッセージ・ステータスコードは各 endpoint の仕様に揃える。
 */
export function parseListQuery(
  c: Context<{ Bindings: Env }>,
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): ParsedListQuery {
  const defaultLimit = opts.defaultLimit ?? 20;
  const maxLimit = opts.maxLimit ?? 50;

  const limitRaw = c.req.query("limit") ?? String(defaultLimit);
  const limitNum = Number(limitRaw);
  if (!Number.isInteger(limitNum) || limitNum < 1 || limitNum > maxLimit) {
    return {
      ok: false,
      response: c.json({ error: `limit must be an integer between 1 and ${maxLimit}` }, 400),
    };
  }

  const cursorRaw = c.req.query("cursor");
  const cursor = decodeCursor(cursorRaw);
  // cursor が指定されているのに decode に失敗した場合は 400
  if (cursorRaw && !cursor) {
    return { ok: false, response: c.json({ error: "invalid cursor" }, 400) };
  }

  return { ok: true, limit: limitNum, cursor };
}
