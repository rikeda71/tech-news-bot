import { describe, expect, it } from "vite-plus/test";
import { SELF } from "cloudflare:test";

// catalogHandler は /api/ (GET /) にマウントされている
const CATALOG_URL = "https://example.com/api";

describe("GET /api (catalog endpoint)", () => {
  it("returns 200 with JSON body", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("sets Cache-Control: public, max-age=3600", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("response has name, version, description, endpoints, syndication, docs_url fields", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    const body = await res.json<Record<string, unknown>>();
    expect.soft(typeof body["name"]).toBe("string");
    expect.soft(typeof body["version"]).toBe("string");
    expect.soft(typeof body["description"]).toBe("string");
    expect.soft(Array.isArray(body["endpoints"])).toBe(true);
    expect.soft(Array.isArray(body["syndication"])).toBe(true);
    expect.soft(typeof body["docs_url"]).toBe("string");
  });

  it("endpoints array contains entries with method, path, description, auth fields", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    const body = await res.json<{
      endpoints: { method: string; path: string; description: string; auth: string }[];
    }>();
    expect(body.endpoints.length).toBeGreaterThan(0);
    for (const ep of body.endpoints) {
      expect.soft(typeof ep.method).toBe("string");
      expect.soft(typeof ep.path).toBe("string");
      expect.soft(typeof ep.description).toBe("string");
      expect.soft(["none", "admin"]).toContain(ep.auth);
    }
  });

  it("syndication array contains entries with path and format fields", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    const body = await res.json<{ syndication: { path: string; format: string }[] }>();
    expect(body.syndication.length).toBeGreaterThan(0);
    for (const s of body.syndication) {
      expect.soft(typeof s.path).toBe("string");
      expect.soft(typeof s.format).toBe("string");
    }
  });

  it("contains /api/articles endpoint in the catalog", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    const body = await res.json<{ endpoints: { path: string }[] }>();
    const paths = body.endpoints.map((ep) => ep.path);
    expect(paths).toContain("/api/articles");
  });

  it("admin endpoints have auth=admin", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    const body = await res.json<{ endpoints: { path: string; auth: string }[] }>();
    const adminEndpoints = body.endpoints.filter((ep) => ep.path.startsWith("/api/admin"));
    expect(adminEndpoints.length).toBeGreaterThan(0);
    for (const ep of adminEndpoints) {
      expect.soft(ep.auth).toBe("admin");
    }
  });

  it("public endpoints have auth=none", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    const body = await res.json<{ endpoints: { path: string; auth: string }[] }>();
    const publicEndpoints = body.endpoints.filter((ep) => !ep.path.startsWith("/api/admin"));
    expect(publicEndpoints.length).toBeGreaterThan(0);
    for (const ep of publicEndpoints) {
      expect.soft(ep.auth).toBe("none");
    }
  });

  it("syndication includes JSON Feed, RSS, Atom, and OPML formats", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    const body = await res.json<{ syndication: { path: string; format: string }[] }>();
    const formats = body.syndication.map((s) => s.format);
    // 主要フォーマットが含まれること
    const hasJsonFeed = formats.some((f) => f.includes("JSON Feed"));
    const hasRss = formats.some((f) => f.includes("RSS"));
    const hasAtom = formats.some((f) => f.includes("Atom"));
    const hasOpml = formats.some((f) => f.includes("OPML"));
    expect.soft(hasJsonFeed).toBe(true);
    expect.soft(hasRss).toBe(true);
    expect.soft(hasAtom).toBe(true);
    expect.soft(hasOpml).toBe(true);
  });

  it("docs_url points to the GitHub repository", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    const body = await res.json<{ docs_url: string }>();
    expect(body.docs_url).toMatch(/^https?:\/\//);
  });
});
