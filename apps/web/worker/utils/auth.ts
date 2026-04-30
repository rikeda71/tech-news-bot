import type { MiddlewareHandler } from "hono";
import type { Env } from "../types";

/**
 * 定数時間比較。長さが異なる場合も同じバイト数を読みに行くことで、
 * 文字列長の length oracle 化を抑止する (UTF-8 のバイト長を比較対象とする)。
 * 完全な対策は Web Crypto の `crypto.subtle.timingSafeEqual` などだが、
 * Cloudflare Workers ではまだ未提供の API があるため自前実装にしている。
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // 比較対象を同じバイト長に揃えて毎回ループを回すことで、長さ判定だけで早期 return しない。
  // 長さが異なる場合は最終的に length 比較で false を返す。
  const len = Math.max(ab.length, bb.length);
  let result = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    const av = i < ab.length ? ab[i]! : 0;
    const bv = i < bb.length ? bb[i]! : 0;
    result |= av ^ bv;
  }
  return result === 0;
}

// 現行 token または次世代 token のいずれかに一致すれば認証 OK。
// ローテーション期間中は両方を受け入れ、完了後に ADMIN_TOKEN_NEXT を削除する。
export function isValidAdminToken(token: string, env: Env): boolean {
  const current = env.ADMIN_TOKEN;
  const next = env.ADMIN_TOKEN_NEXT;
  if (current && timingSafeEqual(token, current)) return true;
  if (next && timingSafeEqual(token, next)) return true;
  return false;
}

/**
 * Bearer token を検証する Hono middleware。
 * - ADMIN_TOKEN 未設定時は 503
 * - ヘッダー欠落 / 不一致は 401
 */
export const adminAuthMiddleware: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  if (!c.env.ADMIN_TOKEN) {
    return c.json({ error: "service unavailable" }, 503);
  }
  const auth = c.req.header("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token || !isValidAdminToken(token, c.env)) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return await next();
};
