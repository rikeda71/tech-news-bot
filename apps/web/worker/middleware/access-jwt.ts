import type { MiddlewareHandler } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "../types";

export interface AccessUser {
  email: string | undefined;
  sub: string | undefined;
}

interface JwksCache {
  teamDomain: string;
  jwks: ReturnType<typeof createRemoteJWKSet>;
}
// Worker isolate 内で JWKS を再利用する。jose が内部で 5 分ごとにリフレッシュするため
// 明示的な TTL 管理は不要。
let cached: JwksCache | undefined;

function getJwks(teamDomain: string) {
  if (cached && cached.teamDomain === teamDomain) return cached.jwks;
  const jwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  cached = { teamDomain, jwks };
  return jwks;
}

export const accessJwtMiddleware: MiddlewareHandler<{
  Bindings: Env;
  Variables: { accessUser: AccessUser };
}> = async (c, next) => {
  // ローカル開発では Access が前段にいないためスキップする
  if (c.env.SKIP_ACCESS_JWT === "1") {
    return await next();
  }

  const aud = c.env.CF_ACCESS_AUD;
  const teamDomain = c.env.CF_ACCESS_TEAM_DOMAIN;
  if (!aud || !teamDomain) {
    console.error("[access-jwt] CF_ACCESS_AUD or CF_ACCESS_TEAM_DOMAIN not configured");
    return c.json({ error: "service unavailable" }, 503);
  }

  const token = c.req.header("cf-access-jwt-assertion");
  if (!token) {
    return c.json({ error: "unauthorized" }, 401);
  }

  try {
    const jwks = getJwks(teamDomain);
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://${teamDomain}`,
      audience: aud,
    });
    c.set("accessUser", {
      email: typeof payload.email === "string" ? payload.email : undefined,
      sub: typeof payload.sub === "string" ? payload.sub : undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[access-jwt] verification failed: ${msg}`);
    return c.json({ error: "unauthorized" }, 401);
  }

  return await next();
};
