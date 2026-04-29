import { describe, expect, it } from "vite-plus/test";
import { SELF } from "cloudflare:test";

// catalogHandler は /api/ (GET /) にマウントされている
const CATALOG_URL = "https://example.com/api";

describe("GET /api (catalog endpoint)", () => {
  it("returns 200 with JSON body", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("sets Cache-Control: public, max-age=3600", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });

  it("response has name, version, description, endpoints, syndication, docs_url fields", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    const body = await res.json<Record<string, unknown>>();
    expect(typeof body["name"]).toBe("string");
    expect(typeof body["version"]).toBe("string");
    expect(typeof body["description"]).toBe("string");
    expect(Array.isArray(body["endpoints"])).toBe(true);
    expect(Array.isArray(body["syndication"])).toBe(true);
    expect(typeof body["docs_url"]).toBe("string");
  });

  it("endpoints array contains entries with method, path, description, auth fields", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    const body = await res.json<{
      endpoints: { method: string; path: string; description: string; auth: string }[];
    }>();
    expect(body.endpoints.length).toBeGreaterThan(0);
    for (const ep of body.endpoints) {
      expect(typeof ep.method).toBe("string");
      expect(typeof ep.path).toBe("string");
      expect(typeof ep.description).toBe("string");
      expect(["none", "admin"]).toContain(ep.auth);
    }
  });

  it("syndication array contains entries with path and format fields", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    const body = await res.json<{ syndication: { path: string; format: string }[] }>();
    expect(body.syndication.length).toBeGreaterThan(0);
    for (const s of body.syndication) {
      expect(typeof s.path).toBe("string");
      expect(typeof s.format).toBe("string");
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
      expect(ep.auth).toBe("admin");
    }
  });

  it("public endpoints have auth=none", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    const body = await res.json<{ endpoints: { path: string; auth: string }[] }>();
    const publicEndpoints = body.endpoints.filter((ep) => !ep.path.startsWith("/api/admin"));
    expect(publicEndpoints.length).toBeGreaterThan(0);
    for (const ep of publicEndpoints) {
      expect(ep.auth).toBe("none");
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
    expect(hasJsonFeed).toBe(true);
    expect(hasRss).toBe(true);
    expect(hasAtom).toBe(true);
    expect(hasOpml).toBe(true);
  });

  it("docs_url points to the GitHub repository", async () => {
    const res = await SELF.fetch(CATALOG_URL);
    const body = await res.json<{ docs_url: string }>();
    expect(body.docs_url).toMatch(/^https?:\/\//);
  });
});
