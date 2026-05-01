import { describe, expect, it } from "vite-plus/test";
import { Hono } from "hono";
import { aiCrawlerBlock, isAiTrainingBot } from "../../../worker/middleware/ai-crawler-block";
import type { Env } from "../../../worker/types";

function makeApp() {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", aiCrawlerBlock);
  app.get("/x", (c) => c.text("ok"));
  return app;
}

const MIN_ENV = {} as Partial<Env>;

// ---------------------------------------------------------------------------
// isAiTrainingBot — 純粋関数のテスト
// ---------------------------------------------------------------------------
describe("isAiTrainingBot", () => {
  describe("null / undefined / 空文字 → false", () => {
    it("null を渡すと false を返す", () => {
      expect(isAiTrainingBot(null)).toBe(false);
    });

    it("undefined を渡すと false を返す", () => {
      expect(isAiTrainingBot(undefined)).toBe(false);
    });

    it("空文字を渡すと false を返す", () => {
      expect(isAiTrainingBot("")).toBe(false);
    });
  });

  describe("denylist 12 token → true", () => {
    it.each([
      ["GPTBot", "GPTBot/1.0"],
      ["ClaudeBot", "ClaudeBot/1.0"],
      ["anthropic-ai", "anthropic-ai/0.1"],
      ["Claude-Web", "Claude-Web/1.0"],
      ["Google-Extended", "Google-Extended/1.0"],
      ["CCBot", "CCBot/2.0"],
      ["Bytespider", "Bytespider/1.0"],
      ["Amazonbot", "Amazonbot/0.1"],
      ["Applebot-Extended", "Applebot-Extended/1.0"],
      ["Meta-ExternalAgent", "Meta-ExternalAgent/1.0"],
      ["FacebookBot", "FacebookBot/1.0"],
      ["cohere-training-data-crawler", "cohere-training-data-crawler/1.0"],
    ])("token=%s の UA は true を返す", (_token, ua) => {
      expect(isAiTrainingBot(ua)).toBe(true);
    });
  });

  describe("case-insensitive マッチ → true", () => {
    it("小文字 gptbot/1.0 は true を返す", () => {
      expect(isAiTrainingBot("gptbot/1.0")).toBe(true);
    });

    it("大文字 CLAUDEBOT/1.0 は true を返す", () => {
      expect(isAiTrainingBot("CLAUDEBOT/1.0")).toBe(true);
    });

    it("混在ケース AnThRoPiC-Ai は true を返す", () => {
      expect(isAiTrainingBot("AnThRoPiC-Ai/1.0")).toBe(true);
    });
  });

  describe("部分マッチ → true", () => {
    it("something-GPTBot-something は true を返す", () => {
      expect(isAiTrainingBot("something-GPTBot-something/1.0")).toBe(true);
    });
  });

  describe("通常ブラウザ UA → false", () => {
    it("Chrome UA は false を返す", () => {
      expect(
        isAiTrainingBot(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        ),
      ).toBe(false);
    });

    it("Firefox UA は false を返す", () => {
      expect(
        isAiTrainingBot(
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:125.0) Gecko/20100101 Firefox/125.0",
        ),
      ).toBe(false);
    });
  });

  describe("代理エージェント → false (必ず通過)", () => {
    it.each([
      ["ChatGPT-User", "ChatGPT-User/1.0"],
      ["Claude-User", "Claude-User/1.0"],
      ["OAI-SearchBot", "OAI-SearchBot/1.0"],
      ["Claude-SearchBot", "Claude-SearchBot/1.0"],
      ["PerplexityBot", "PerplexityBot/1.0"],
    ])("代理エージェント %s は false を返す", (_name, ua) => {
      expect(isAiTrainingBot(ua)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// aiCrawlerBlock middleware のテスト
// ---------------------------------------------------------------------------
describe("aiCrawlerBlock middleware", () => {
  it("AI_BOT_BLOCK_ENABLED=1 + 学習 bot UA → 403 + JSON error body + X-Robots-Tag", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://x.test/x", {
        headers: { "user-agent": "GPTBot/1.0" },
      }),
      { ...MIN_ENV, AI_BOT_BLOCK_ENABLED: "1" } as Env,
    );

    // fail-fast: status が 403 でなければ body の検証が無意味
    expect(res.status).toBe(403);
    const body = await res.json<{ error: string; code: string }>();
    expect.soft(body.error).toBe("AI crawlers are not allowed");
    expect.soft(body.code).toBe("ai_bot_blocked");
    expect.soft(res.headers.get("X-Robots-Tag")).toBe("noai, noimageai");
  });

  it("AI_BOT_BLOCK_ENABLED=1 + 代理エージェント UA (ChatGPT-User) → 200 + X-Robots-Tag", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://x.test/x", {
        headers: { "user-agent": "ChatGPT-User/1.0" },
      }),
      { ...MIN_ENV, AI_BOT_BLOCK_ENABLED: "1" } as Env,
    );

    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("X-Robots-Tag")).toBe("noai, noimageai");
  });

  it("AI_BOT_BLOCK_ENABLED=1 + 代理エージェント UA (Claude-User) → 200 + X-Robots-Tag", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://x.test/x", {
        headers: { "user-agent": "Claude-User/1.0" },
      }),
      { ...MIN_ENV, AI_BOT_BLOCK_ENABLED: "1" } as Env,
    );

    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("X-Robots-Tag")).toBe("noai, noimageai");
  });

  it("AI_BOT_BLOCK_ENABLED=1 + 代理エージェント UA (OAI-SearchBot) → 200 + X-Robots-Tag", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://x.test/x", {
        headers: { "user-agent": "OAI-SearchBot/1.0" },
      }),
      { ...MIN_ENV, AI_BOT_BLOCK_ENABLED: "1" } as Env,
    );

    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("X-Robots-Tag")).toBe("noai, noimageai");
  });

  it("AI_BOT_BLOCK_ENABLED=1 + 通常ブラウザ UA → 200 + X-Robots-Tag", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://x.test/x", {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      }),
      { ...MIN_ENV, AI_BOT_BLOCK_ENABLED: "1" } as Env,
    );

    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("X-Robots-Tag")).toBe("noai, noimageai");
  });

  it("AI_BOT_BLOCK_ENABLED 未設定 + 学習 bot UA → 200 + X-Robots-Tag (フラグ off は完全 no-op)", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://x.test/x", {
        headers: { "user-agent": "GPTBot/1.0" },
      }),
      { ...MIN_ENV } as Env,
    );

    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("X-Robots-Tag")).toBe("noai, noimageai");
  });

  it("AI_BOT_BLOCK_ENABLED=0 + 学習 bot UA → 200 + X-Robots-Tag", async () => {
    const app = makeApp();
    const res = await app.fetch(
      new Request("https://x.test/x", {
        headers: { "user-agent": "ClaudeBot/1.0" },
      }),
      { ...MIN_ENV, AI_BOT_BLOCK_ENABLED: "0" } as Env,
    );

    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("X-Robots-Tag")).toBe("noai, noimageai");
  });

  it("AI_BOT_BLOCK_ENABLED=1 + UA ヘッダー無し → 200 + X-Robots-Tag", async () => {
    const app = makeApp();
    const res = await app.fetch(new Request("https://x.test/x"), {
      ...MIN_ENV,
      AI_BOT_BLOCK_ENABLED: "1",
    } as Env);

    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("X-Robots-Tag")).toBe("noai, noimageai");
  });
});
