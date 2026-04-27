import type { CollectResult } from "./index";

export interface AlertSummary {
  failedFeeds: { id: string; error: string }[];
  streakFeeds: { id: string; consecutiveFailures: number }[];
}

/**
 * Slack Incoming Webhook 互換の payload で失敗を通知する。
 * Discord は ?slack suffix を付けることで同じ {text} 形式を受け入れる。
 * 通知失敗は console.error のみ。Cron を落とさないよう throw しない。
 */
export async function notifyCollectorFailure(
  webhookUrl: string,
  summary: AlertSummary,
): Promise<void> {
  const lines: string[] = ["[tech-news-bot] collector failure alert"];

  if (summary.failedFeeds.length > 0) {
    lines.push(`\nFailed feeds (${summary.failedFeeds.length}):`);
    for (const f of summary.failedFeeds) {
      lines.push(`  - ${f.id}: ${f.error.slice(0, 200)}`);
    }
  }

  if (summary.streakFeeds.length > 0) {
    lines.push(`\nConsecutive failure streaks:`);
    for (const f of summary.streakFeeds) {
      lines.push(`  - ${f.id}: ${f.consecutiveFailures} consecutive failures`);
    }
  }

  const text = lines.join("\n");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[alert] webhook returned non-2xx: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error(
      `[alert] failed to send webhook: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/** collectAll の結果と streak 情報からアラートを送るべきか判定し、必要なら通知する。 */
export async function maybeAlert(
  webhookUrl: string | undefined,
  results: CollectResult[],
  streaks: { id: string; consecutive_failures: number }[],
  minFailures: number,
  feedStreak: number,
): Promise<void> {
  if (!webhookUrl) return;

  const failedFeeds = results
    .filter((r) => r.status === "error")
    .map((r) => ({ id: r.feedId, error: r.error ?? "unknown error" }));

  const streakFeeds = streaks
    .filter((s) => s.consecutive_failures >= feedStreak)
    .map((s) => ({ id: s.id, consecutiveFailures: s.consecutive_failures }));

  const shouldAlert = failedFeeds.length >= minFailures || streakFeeds.length > 0;
  if (!shouldAlert) return;

  await notifyCollectorFailure(webhookUrl, { failedFeeds, streakFeeds });
}
