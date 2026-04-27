import type { Env } from "../types";
import type { CollectResult } from "./index";

export interface AlertSummary {
  failedFeeds: { id: string; error: string }[];
  streakFeeds: { id: string; consecutiveFailures: number }[];
}

/** sendAlert に渡す run 結果のサブセット */
export interface AlertRunResult {
  total: number;
  results: CollectResult[];
}

const TOP_ERRORS_MAX = 5;

/**
 * Slack Incoming Webhook 互換の payload で失敗を通知する。
 * Discord は blocks を無視して text フィールドをメッセージとして表示する。
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

/**
 * collectAll の結果から Slack/Discord 互換の blocks 形式で通知する。
 * COLLECTOR_ALERT_WEBHOOK が未設定なら no-op。fetch 失敗は console.error のみ。
 */
export async function sendAlert(env: Env, result: AlertRunResult): Promise<void> {
  const webhookUrl = env.COLLECTOR_ALERT_WEBHOOK;
  if (!webhookUrl) return;

  const threshold = Number(env.COLLECTOR_ALERT_THRESHOLD ?? "5") || 5;
  const feedsFailed = result.results.filter((r) => r.status === "error").length;

  if (feedsFailed < threshold) return;

  const now = new Date().toISOString();
  const topErrors = result.results
    .filter((r) => r.status === "error")
    .slice(0, TOP_ERRORS_MAX)
    .map((r) => `${r.feedId} (${(r.error ?? "unknown").slice(0, 100)})`)
    .join(", ");

  const mrkdwn = [
    `*Failed:* ${feedsFailed} / ${result.total}`,
    `*Time:* ${now}`,
    `*Top errors:* ${topErrors}`,
  ].join("\n");

  const payload = {
    text: "tech-news-bot collector alert",
    blocks: [
      {
        type: "section",
        text: { type: "mrkdwn", text: mrkdwn },
      },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(
        `[alert] sendAlert webhook returned non-2xx: ${res.status} ${res.statusText}`,
      );
    }
  } catch (err) {
    console.error(
      `[alert] sendAlert failed: ${err instanceof Error ? err.message : String(err)}`,
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
