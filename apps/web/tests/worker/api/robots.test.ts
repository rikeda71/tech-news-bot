import { beforeAll, describe, expect, it } from "vite-plus/test";
import { SELF } from "cloudflare:test";
import { AI_TRAINING_BOT_TOKENS } from "../../../worker/middleware/ai-crawler-block";

// 必ず通過すべき代理エージェント (明示 Disallow されてはいけない)
const PROXY_AGENTS = [
  "ChatGPT-User",
  "Claude-User",
  "OAI-SearchBot",
  "Claude-SearchBot",
  "PerplexityBot",
] as const;

describe("/robots.txt", () => {
  let response: Response;
  let robotsTxt: string;

  beforeAll(async () => {
    response = await SELF.fetch("https://x.test/robots.txt");
    robotsTxt = await response.text();
  });

  it("ステータス 200 を返す", () => {
    expect(response.status).toBe(200);
  });

  it("Content-Type が text/plain; charset=utf-8 を含む", () => {
    expect.soft(response.headers.get("Content-Type")).toContain("text/plain");
    expect.soft(response.headers.get("Content-Type")).toContain("charset=utf-8");
  });

  it("Cache-Control が public, max-age=3600, stale-while-revalidate=86400 である (変わっていないこと)", () => {
    expect(response.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, stale-while-revalidate=86400",
    );
  });

  it("body に User-agent: * が含まれる", () => {
    expect(robotsTxt).toContain("User-agent: *");
  });

  it("body に Allow: / が含まれる", () => {
    expect(robotsTxt).toContain("Allow: /");
  });

  it("body に Disallow: /api/admin/ が含まれる", () => {
    expect(robotsTxt).toContain("Disallow: /api/admin/");
  });

  it("body に Sitemap: https://x.test/sitemap.xml が含まれる", () => {
    expect(robotsTxt).toContain("Sitemap: https://x.test/sitemap.xml");
  });

  describe("AI 学習 bot の User-agent と Disallow: / が含まれる", () => {
    it.each(AI_TRAINING_BOT_TOKENS)("bot=%s の User-agent 行と Disallow: / が含まれる", (bot) => {
      expect.soft(robotsTxt).toContain(`User-agent: ${bot}`);
      // 各 AI 学習 bot のセクションに Disallow: / がある
      // セクション単位でパースして確認する
      const sections = robotsTxt.split(/\n\n+/);
      const botSection = sections.find((s) => s.includes(`User-agent: ${bot}`));
      expect(botSection).toBeDefined();
      expect(botSection).toContain("Disallow: /");
    });
  });

  describe("代理エージェントは明示 Disallow されていない", () => {
    it.each(PROXY_AGENTS)(
      "代理エージェント %s は User-agent として明示 Disallow されていない",
      (agent) => {
        const lines = robotsTxt.split("\n");
        // "User-agent: <agent>" という行が存在しないことを negative assert
        const hasExplicitEntry = lines.some((line) => line.trim() === `User-agent: ${agent}`);
        expect(hasExplicitEntry).toBe(false);
      },
    );
  });
});
