import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:test";
import { insertArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import {
  buildPayload,
  countByCategory,
  fetchLast24hArticles,
  postDailyDigest,
  sendDailyDigest,
  type DailyDigestArticle,
} from "../../../worker/notify/slack-daily";
import type { FeedConfig } from "../../../worker/types";

const WEBHOOK_URL = "https://hooks.slack.com/services/test/webhook";

const FEEDS: FeedConfig[] = [
  {
    id: "feed-bigtech",
    name: "BigTech Blog",
    url: "https://bigtech.test/rss",
    category: "bigtech",
    lang: "en",
    enabled: true,
  },
  {
    id: "feed-ai",
    name: "AI News",
    url: "https://ai.test/rss",
    category: "ai",
    lang: "en",
    enabled: true,
  },
  {
    id: "feed-jp",
    name: "JP Blog",
    url: "https://jp.test/rss",
    category: "jp",
    lang: "ja",
    enabled: true,
  },
  {
    id: "feed-zenn",
    name: "Zenn",
    url: "https://zenn.dev/feed",
    category: "zenn",
    lang: "ja",
    enabled: true,
  },
];

beforeEach(async () => {
  await syncFeeds(env.DB, FEEDS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// 現在時刻から指定分だけ前の ISO 文字列を返す
function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60 * 1000).toISOString();
}

// 現在時刻から指定時間だけ前の ISO 文字列を返す
function hoursAgo(hours: number): string {
  return minutesAgo(hours * 60);
}

describe("fetchLast24hArticles", () => {
  it("returns empty array when no articles exist", async () => {
    const articles = await fetchLast24hArticles(env.DB);
    expect(articles).toHaveLength(0);
  });

  it("returns articles published within 24 hours", async () => {
    await insertArticles(env.DB, [
      {
        guid: "g1",
        feed_id: "feed-bigtech",
        title: "Recent Article",
        url: "https://bigtech.test/1",
        summary: null,
        author: null,
        published_at: hoursAgo(1),
        category: "bigtech",
        lang: "en",
      },
    ]);

    const articles = await fetchLast24hArticles(env.DB);
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe("Recent Article");
  });

  it("excludes articles older than 24 hours", async () => {
    await insertArticles(env.DB, [
      {
        guid: "g-old",
        feed_id: "feed-bigtech",
        title: "Old Article",
        url: "https://bigtech.test/old",
        summary: null,
        author: null,
        published_at: hoursAgo(25),
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "g-new",
        feed_id: "feed-ai",
        title: "New Article",
        url: "https://ai.test/new",
        summary: null,
        author: null,
        published_at: hoursAgo(1),
        category: "ai",
        lang: "en",
      },
    ]);

    const articles = await fetchLast24hArticles(env.DB);
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe("New Article");
  });
});

describe("countByCategory", () => {
  it("returns zero counts when articles is empty", () => {
    const counts = countByCategory([]);
    expect(counts.bigtech).toBe(0);
    expect(counts.ai).toBe(0);
    expect(counts.jp).toBe(0);
    expect(counts.zenn).toBe(0);
  });

  it("counts articles by category correctly", () => {
    const articles: DailyDigestArticle[] = [
      { title: "a1", url: "u1", feed_name: "F", category: "bigtech" },
      { title: "a2", url: "u2", feed_name: "F", category: "bigtech" },
      { title: "a3", url: "u3", feed_name: "F", category: "ai" },
      { title: "a4", url: "u4", feed_name: "F", category: "zenn" },
    ];
    const counts = countByCategory(articles);
    expect(counts.bigtech).toBe(2);
    expect(counts.ai).toBe(1);
    expect(counts.jp).toBe(0);
    expect(counts.zenn).toBe(1);
  });
});

describe("buildPayload", () => {
  it("returns text with total count when articles exist", () => {
    const articles: DailyDigestArticle[] = Array.from({ length: 3 }, (_, i) => ({
      title: `Article ${i}`,
      url: `https://example.test/${i}`,
      feed_name: "Feed",
      category: "bigtech" as const,
    }));
    const { text } = buildPayload(articles, "2026-04-28");
    expect(text).toContain("2026-04-28");
    expect(text).toContain("3 件");
  });

  it("returns empty-looking text when articles is empty", () => {
    const { text, blocks } = buildPayload([], "2026-04-28");
    expect(text).toContain("0 件");
    // header + summary + divider (カテゴリ section なし)
    expect((blocks as unknown[]).length).toBe(3);
  });

  it("limits each category to MAX_PER_CATEGORY (5) articles", () => {
    // 10 件の bigtech 記事を用意
    const articles: DailyDigestArticle[] = Array.from({ length: 10 }, (_, i) => ({
      title: `Article ${i}`,
      url: `https://bigtech.test/${i}`,
      feed_name: "BigTech",
      category: "bigtech" as const,
    }));
    const { blocks } = buildPayload(articles, "2026-04-28");

    // カテゴリ section は 1 つ (bigtech のみ)
    const sections = (blocks as { type: string; text?: { text: string } }[]).filter(
      (b) => b.type === "section",
    );
    const bigtechSection = sections.find((s) => s.text?.text.includes("ビッグテック"));
    expect(bigtechSection).toBeDefined();
    // 5 件の bullet + 1 行の「他 N 件」= 6 行
    const lineCount = (bigtechSection!.text!.text.match(/\n/g) ?? []).length;
    // タイトル行 (1) + 5 件 bullet + 他 N 件 = 7 行 → 改行は 6 個
    expect(lineCount).toBe(6);
    // 「他 5 件」の表示を確認
    expect(bigtechSection!.text!.text).toContain("他 5 件");
  });

  it("does not show 'other N' when articles <= 5 per category", () => {
    const articles: DailyDigestArticle[] = Array.from({ length: 3 }, (_, i) => ({
      title: `Article ${i}`,
      url: `https://bigtech.test/${i}`,
      feed_name: "BigTech",
      category: "bigtech" as const,
    }));
    const { blocks } = buildPayload(articles, "2026-04-28");
    const sections = (blocks as { type: string; text?: { text: string } }[]).filter(
      (b) => b.type === "section",
    );
    const bigtechSection = sections.find((s) => s.text?.text.includes("ビッグテック"));
    expect(bigtechSection?.text?.text).not.toContain("他");
  });
});

describe("postDailyDigest", () => {
  it("returns posted=false when webhookUrl is undefined", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await postDailyDigest(undefined, [], "2026-04-28");
    expect(result.posted).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns posted=false when webhookUrl is empty string", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await postDailyDigest("", [], "2026-04-28");
    expect(result.posted).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("calls fetch with POST when webhookUrl is set", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await postDailyDigest(WEBHOOK_URL, [], "2026-04-28");
    expect(result.posted).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(WEBHOOK_URL);
    expect(init?.method).toBe("POST");
  });

  it("payload contains date label and article count", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const articles: DailyDigestArticle[] = [
      { title: "Test", url: "https://example.test/1", feed_name: "F", category: "ai" },
    ];
    await postDailyDigest(WEBHOOK_URL, articles, "2026-04-28");

    const body = JSON.parse(spy.mock.calls[0][1]?.body as string) as {
      text: string;
      blocks: unknown[];
    };
    expect(body.text).toContain("2026-04-28");
    expect(body.text).toContain("1 件");
    expect(Array.isArray(body.blocks)).toBe(true);
  });

  it("returns posted=false with error when webhook returns non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(null, { status: 500 }));
    const result = await postDailyDigest(WEBHOOK_URL, [], "2026-04-28");
    expect(result.posted).toBe(false);
    expect(result.error).toBe("status 500");
  });

  it("returns posted=false with error message when fetch throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const result = await postDailyDigest(WEBHOOK_URL, [], "2026-04-28");
    expect(result.posted).toBe(false);
    expect(result.error).toBe("Failed to fetch");
  });
});

describe("sendDailyDigest", () => {
  it("returns posted=false when SLACK_WEBHOOK_URL is not set", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    const result = await sendDailyDigest(env.DB, undefined);
    expect(result.posted).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it("posts to Slack with articles from D1 when webhook URL is set", async () => {
    await insertArticles(env.DB, [
      {
        guid: "g-slack-1",
        feed_id: "feed-bigtech",
        title: "Slack Test Article",
        url: "https://bigtech.test/slack",
        summary: null,
        author: null,
        published_at: hoursAgo(2),
        category: "bigtech",
        lang: "en",
      },
    ]);

    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await sendDailyDigest(env.DB, WEBHOOK_URL);
    expect(result.posted).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);

    const body = JSON.parse(spy.mock.calls[0][1]?.body as string) as { text: string };
    expect(body.text).toContain("1 件");
  });

  it("posts empty digest (0 件) when no articles in last 24h", async () => {
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const result = await sendDailyDigest(env.DB, WEBHOOK_URL);
    expect(result.posted).toBe(true);

    const body = JSON.parse(spy.mock.calls[0][1]?.body as string) as { text: string };
    expect(body.text).toContain("0 件");
  });
});
