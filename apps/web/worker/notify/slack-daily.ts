import type { FeedCategory } from "../types";

/** カテゴリの表示名マップ */
const CATEGORY_LABELS: Record<FeedCategory, string> = {
  bigtech: "🏢 ビッグテック",
  ai: "🤖 AI",
  jp: "🇯🇵 日本語",
  zenn: "📝 Zenn",
};

const CATEGORIES: FeedCategory[] = ["bigtech", "ai", "jp", "zenn"];
const MAX_PER_CATEGORY = 5;

export interface DailyDigestArticle {
  title: string;
  url: string;
  feed_name?: string | null;
  category: FeedCategory;
}

export interface DailyDigestResult {
  /** 投稿が行われた (webhookUrl が設定されていた) 場合 true */
  posted: boolean;
}

/** 過去 24 時間の記事を D1 から取得する */
export async function fetchLast24hArticles(db: D1Database): Promise<DailyDigestArticle[]> {
  const result = await db
    .prepare(
      // datetime() で正規化しないと ISO 8601 ('T' 含む) と SQLite datetime() 出力 (スペース区切り) のテキスト比較が壊れる
      `SELECT a.title, a.url, f.name AS feed_name, a.category
       FROM articles a
       LEFT JOIN feeds f ON f.id = a.feed_id
       WHERE datetime(a.published_at) > datetime('now', '-1 day')
       ORDER BY a.published_at DESC`,
    )
    .all<DailyDigestArticle>();
  return result.results ?? [];
}

/** カテゴリ別の件数を集計する */
export function countByCategory(articles: DailyDigestArticle[]): Record<FeedCategory, number> {
  const counts: Record<FeedCategory, number> = { bigtech: 0, ai: 0, jp: 0, zenn: 0 };
  for (const a of articles) {
    if (a.category in counts) counts[a.category]++;
  }
  return counts;
}

/** Slack blocks payload を組み立てる */
export function buildPayload(
  articles: DailyDigestArticle[],
  dateLabel: string,
): { text: string; blocks: unknown[] } {
  const total = articles.length;
  const counts = countByCategory(articles);

  const summaryParts = CATEGORIES.map((cat) => `${cat} ${counts[cat]}`).join(" / ");
  const headerText = `📰 Tech News Daily — ${dateLabel}`;
  const summaryText = `*過去 24h: ${total} 件* (${summaryParts})`;

  const blocks: unknown[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText },
    },
    {
      type: "section",
      text: { type: "mrkdwn", text: summaryText },
    },
    { type: "divider" },
  ];

  // カテゴリ別に section を追加
  for (const cat of CATEGORIES) {
    const catArticles = articles.filter((a) => a.category === cat);
    if (catArticles.length === 0) continue;

    const excerpt = catArticles.slice(0, MAX_PER_CATEGORY);
    const remaining = catArticles.length - excerpt.length;

    const lines = excerpt.map((a) => {
      const feedLabel = a.feed_name ? ` _(${a.feed_name})_` : "";
      return `• <${a.url}|${a.title}>${feedLabel}`;
    });
    if (remaining > 0) {
      lines.push(`_... 他 ${remaining} 件_`);
    }

    const label = CATEGORY_LABELS[cat];
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${label} (${catArticles.length} 件抜粋)*\n${lines.join("\n")}`,
      },
    });
  }

  return {
    text: `📰 Tech News Daily — ${dateLabel} (${total} 件)`,
    blocks,
  };
}

/**
 * Slack incoming webhook に日次ダイジェストを投稿する。
 * SLACK_WEBHOOK_URL が未設定なら no-op (ログのみ)。fetch 失敗は console.error のみ。
 * Discord は blocks を無視して text フィールドをメッセージとして表示する。
 */
export async function postDailyDigest(
  webhookUrl: string | undefined,
  articles: DailyDigestArticle[],
  dateLabel: string,
): Promise<DailyDigestResult> {
  if (!webhookUrl) {
    console.log("[slack-daily] SLACK_WEBHOOK_URL not set – skipping daily digest");
    return { posted: false };
  }

  const payload = buildPayload(articles, dateLabel);
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
      console.error(`[slack-daily] webhook returned non-2xx: ${res.status} ${res.statusText}`);
    }
  } catch (err) {
    console.error(
      `[slack-daily] failed to post: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }

  return { posted: true };
}

/**
 * D1 から過去 24h の記事を取得して Slack に投稿するエントリポイント。
 * SLACK_WEBHOOK_URL が未設定なら no-op で正常終了。
 */
export async function sendDailyDigest(
  db: D1Database,
  webhookUrl: string | undefined,
): Promise<DailyDigestResult> {
  if (!webhookUrl) {
    console.log("[slack-daily] SLACK_WEBHOOK_URL not set – skipping daily digest");
    return { posted: false };
  }

  const articles = await fetchLast24hArticles(db);
  const dateLabel = new Date().toISOString().slice(0, 10);
  return postDailyDigest(webhookUrl, articles, dateLabel);
}
