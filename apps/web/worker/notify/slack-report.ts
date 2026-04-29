import type { ReportKind } from "../db/reports";

export interface ReportNotifyParams {
  kind: ReportKind;
  period_start: string;
  period_end: string;
  category: string | null;
  lang: string | null;
  source_skill: string;
  generated_at: string;
  content_bytes: number;
  viewer_url?: string;
}

export interface ReportNotifyResult {
  posted: boolean;
  error?: string;
}

/** Slack blocks payload を組み立てる */
export function buildPayload(params: ReportNotifyParams): { text: string; blocks: unknown[] } {
  const {
    kind,
    period_end,
    category,
    lang,
    source_skill,
    generated_at,
    content_bytes,
    viewer_url,
  } = params;

  const dateLabel = period_end.slice(0, 10);
  const categoryLabel = category ?? "全体";
  const langLabel = lang ?? "全言語";

  const headerText = `📝 Report Saved — ${kind} ${dateLabel}`;
  const summaryText = `*${source_skill}* — category=${categoryLabel} / lang=${langLabel} / ${content_bytes} bytes`;
  const generatedText = `生成日時 ${generated_at}`;
  const fallbackText = `${headerText} (${source_skill} / ${content_bytes} bytes)`;

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: summaryText },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: generatedText },
    },
  ];

  if (viewer_url) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: `<${viewer_url}|レポートを開く>` },
    });
  }

  return {
    text: fallbackText,
    blocks,
  };
}

/**
 * Slack incoming webhook にレポート保存通知を投稿する。
 * webhookUrl が未設定なら no-op。fetch 失敗 / non-2xx は posted=false で返す (throw しない)。
 * Discord は blocks を無視して text フィールドをメッセージとして表示する。
 */
export async function postReportNotification(
  webhookUrl: string | undefined,
  params: ReportNotifyParams,
): Promise<ReportNotifyResult> {
  if (!webhookUrl) {
    console.log("[slack-report] SLACK_WEBHOOK_URL not set – skipping report notification");
    return { posted: false };
  }

  const payload = buildPayload(params);
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
      const error = `status ${res.status}`;
      console.error(`[slack-report] webhook returned non-2xx: ${res.status} ${res.statusText}`);
      return { posted: false, error };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[slack-report] failed to post: ${message}`);
    return { posted: false, error: message };
  } finally {
    clearTimeout(timer);
  }

  return { posted: true };
}
