import { describe, expect, it } from "vite-plus/test";
import { SELF } from "cloudflare:test";

describe("GET /api", () => {
  it("returns 200", async () => {
    const res = await SELF.fetch("https://example.com/api");
    expect(res.status).toBe(200);
  });

  it("returns Content-Type: application/json", async () => {
    const res = await SELF.fetch("https://example.com/api");
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("returns Cache-Control: public, max-age=3600", async () => {
    const res = await SELF.fetch("https://example.com/api");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("endpoints array is non-empty", async () => {
    const res = await SELF.fetch("https://example.com/api");
    const body = (await res.json()) as { endpoints: unknown[] };
    expect.soft(Array.isArray(body.endpoints)).toBe(true);
    expect.soft(body.endpoints.length).toBeGreaterThan(0);
  });

  it("syndication array is non-empty", async () => {
    const res = await SELF.fetch("https://example.com/api");
    const body = (await res.json()) as { syndication: unknown[] };
    expect.soft(Array.isArray(body.syndication)).toBe(true);
    expect.soft(body.syndication.length).toBeGreaterThan(0);
  });

  it("contains /api/articles endpoint", async () => {
    const res = await SELF.fetch("https://example.com/api");
    const body = (await res.json()) as { endpoints: Array<{ path: string }> };
    const paths = body.endpoints.map((e) => e.path);
    expect(paths).toContain("/api/articles");
  });

  it("contains /api/stats endpoint", async () => {
    const res = await SELF.fetch("https://example.com/api");
    const body = (await res.json()) as { endpoints: Array<{ path: string }> };
    const paths = body.endpoints.map((e) => e.path);
    expect(paths).toContain("/api/stats");
  });

  it("contains /api/health endpoint", async () => {
    const res = await SELF.fetch("https://example.com/api");
    const body = (await res.json()) as { endpoints: Array<{ path: string }> };
    const paths = body.endpoints.map((e) => e.path);
    expect(paths).toContain("/api/health");
  });

  it("admin endpoints have auth: admin", async () => {
    const res = await SELF.fetch("https://example.com/api");
    const body = (await res.json()) as {
      endpoints: Array<{ path: string; auth: string }>;
    };
    const adminEndpoints = body.endpoints.filter((e) => e.path.startsWith("/api/admin"));
    expect(adminEndpoints.length).toBeGreaterThan(0);
    for (const ep of adminEndpoints) {
      expect(ep.auth).toBe("admin");
    }
  });

  it("non-admin public endpoints have auth: none", async () => {
    const res = await SELF.fetch("https://example.com/api");
    const body = (await res.json()) as {
      endpoints: Array<{ path: string; auth: string }>;
    };
    const publicEndpoints = body.endpoints.filter((e) => !e.path.startsWith("/api/admin"));
    expect(publicEndpoints.length).toBeGreaterThan(0);
    for (const ep of publicEndpoints) {
      expect(ep.auth).toBe("none");
    }
  });

  it("name and version fields are present", async () => {
    const res = await SELF.fetch("https://example.com/api");
    const body = (await res.json()) as { name: string; version: string };
    expect.soft(typeof body.name).toBe("string");
    expect.soft(body.name.length).toBeGreaterThan(0);
    expect.soft(typeof body.version).toBe("string");
  });
});
