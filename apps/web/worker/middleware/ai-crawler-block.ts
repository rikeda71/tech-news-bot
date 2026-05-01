import type { MiddlewareHandler } from "hono";
import type { Env } from "../types";

// AI 学習 bot の robots.txt token / User-Agent 部分文字列。
// 代理エージェント (ChatGPT-User / Claude-User / OAI-SearchBot / Claude-SearchBot / PerplexityBot)
// は意図的に除外している (ユーザー自発の "この URL を読んで" を 403 にしたくないため)。
export const AI_TRAINING_BOT_TOKENS = [
  "GPTBot",
  "ClaudeBot",
  "anthropic-ai",
  "Claude-Web",
  "Google-Extended",
  "CCBot",
  "Bytespider",
  "Amazonbot",
  "Applebot-Extended",
  "Meta-ExternalAgent",
  "FacebookBot",
  "cohere-training-data-crawler",
] as const;

export function isAiTrainingBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return AI_TRAINING_BOT_TOKENS.some((t) => ua.includes(t.toLowerCase()));
}

export const aiCrawlerBlock: MiddlewareHandler<{ Bindings: Env }> = async (c, next) => {
  // 常に X-Robots-Tag を付与 (HTML を parse しない bot 向けの補助シグナル)。
  // AI_BOT_BLOCK_ENABLED の on/off に関わらずヘッダーは常時付与する。
  // フラグ off で 403 を返さない場合でも noai シグナルだけは常に出す意図。
  c.header("X-Robots-Tag", "noai, noimageai");

  // フラグが "1" のときだけブロック動作。デフォルトは no-op (段階的ロールアウト用)。
  if (c.env.AI_BOT_BLOCK_ENABLED === "1") {
    const ua = c.req.header("user-agent");
    if (isAiTrainingBot(ua)) {
      return c.json({ error: "AI crawlers are not allowed", code: "ai_bot_blocked" }, 403);
    }
  }

  return await next();
};
