import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { Hono } from "hono";
import { accessJwtMiddleware } from "../../../worker/middleware/access-jwt";

function makeApp(env: Record<string, string | undefined>) {
  const app = new Hono<{ Bindings: typeof env }>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use("*", accessJwtMiddleware as any);
  app.get("/", (c) => c.text("ok"));
  return (req: Request) => app.fetch(req, env);
}

describe("accessJwtMiddleware", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("SKIP_ACCESS_JWT=1 のときは next() を呼ぶ", async () => {
    const fetch = makeApp({ SKIP_ACCESS_JWT: "1" });
    const res = await fetch(new Request("https://x.test/"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("ok");
  });

  it("SKIP_ACCESS_JWT=1 でも accessUser が context に set される (Variables 契約維持)", async () => {
    // 下流 handler が c.var.accessUser を参照しても ReferenceError にならないこと
    const app = new Hono<{
      Bindings: { SKIP_ACCESS_JWT?: string };
      Variables: { accessUser: { email: string | undefined; sub: string | undefined } };
    }>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    app.use("*", accessJwtMiddleware as any);
    app.get("/", (c) => c.json({ user: c.get("accessUser") }));
    const res = await app.fetch(new Request("https://x.test/"), { SKIP_ACCESS_JWT: "1" });
    expect(res.status).toBe(200);
    const body = await res.json<{ user: { email: string | undefined; sub: string | undefined } }>();
    expect(body.user).toEqual({ email: undefined, sub: undefined });
  });

  it("CF_ACCESS_AUD / TEAM_DOMAIN 未設定で 503", async () => {
    const fetch = makeApp({});
    const res = await fetch(new Request("https://x.test/"));
    expect(res.status).toBe(503);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("service unavailable");
  });

  it("CF_ACCESS_AUD のみ設定で TEAM_DOMAIN 未設定のとき 503", async () => {
    const fetch = makeApp({ CF_ACCESS_AUD: "test-aud" });
    const res = await fetch(new Request("https://x.test/"));
    expect(res.status).toBe(503);
  });

  it("ヘッダー欠落で 401", async () => {
    const fetch = makeApp({
      CF_ACCESS_AUD: "test-aud",
      CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    });
    const res = await fetch(new Request("https://x.test/"));
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("unauthorized");
  });

  it("不正な JWT で 401", async () => {
    // jose の jwtVerify は JWKS fetch に行くため、実 fetch を stub する
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const fetch = makeApp({
      CF_ACCESS_AUD: "test-aud",
      CF_ACCESS_TEAM_DOMAIN: "test.cloudflareaccess.com",
    });
    const res = await fetch(
      new Request("https://x.test/", {
        headers: { "cf-access-jwt-assertion": "invalid.jwt.token" },
      }),
    );
    expect(res.status).toBe(401);
    const body = await res.json<{ error: string }>();
    expect(body.error).toBe("unauthorized");
  });
});
