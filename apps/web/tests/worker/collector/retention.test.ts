/**
 * retention の一本化テスト
 *
 * collectFeeds が deleteOlderThan を呼ばないこと (pruned は常に 0) を確認する。
 * retention は scheduled() の pruneOldArticles (db/retention.ts) に一本化しており、
 * collector 側では実行しない。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:test";
import { collectFeeds } from "../../../worker/collector/index";
import { insertArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

const VALID_XML = `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><item><title>A</title><link>https://x.test/1</link></item></channel></rss>`;

const FEED: FeedConfig = {
  id: "ret-feed",
  name: "Ret Feed",
  url: "https://ret.test/rss",
  category: "bigtech",
  lang: "en",
  enabled: true,
};

beforeEach(async () => {
  await syncFeeds(env.DB, [FEED]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("collectFeeds: retention は実行しない", () => {
  it("pruned は常に 0 を返す (collectFeeds 内で deleteOlderThan を呼ばない)", async () => {
    // fetch をモックして RSS を返す
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(VALID_XML, { status: 200 }));

    // 90 日超の古い記事を 1 件挿入しておく
    const old = new Date(Date.now() - 100 * 86400 * 1000).toISOString();
    await insertArticles(env.DB, [
      {
        guid: "ret-old",
        feed_id: "ret-feed",
        title: "old article",
        url: "https://ret.test/old",
        summary: null,
        author: null,
        published_at: old,
        category: "bigtech",
        lang: "en",
      },
    ]);

    const result = await collectFeeds(env, ["ret-feed"]);

    // collectFeeds は retention を実行しないため pruned は 0
    expect(result.pruned).toBe(0);

    // 古い記事はまだ残っている (retention は scheduled() で実行されるため)
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM articles WHERE guid = 'ret-old'",
    ).first<{ n: number }>();
    expect(row?.n).toBe(1);
  });
});
