/**
 * retention が collectAll / collectFeeds 内で走らず、
 * scheduled の utcHour === 17 ブランチでのみ実行されることを確認するテスト。
 *
 * - collectAll / collectFeeds は pruned: 0 を返す (D1 書き込みなし)
 * - pruneOldArticles は retention.test.ts で個別にテスト済み
 */
import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:test";
import { syncFeeds } from "../../../worker/db/feeds";
import { insertArticles } from "../../../worker/db/articles";
import { collectFeeds } from "../../../worker/collector/index";
import type { Env, FeedConfig } from "../../../worker/types";

const FEED_A: FeedConfig = {
  id: "feed-retention-test",
  name: "Retention Test Feed",
  url: "https://x.test/retention",
  category: "bigtech",
  lang: "en",
  enabled: true,
};

beforeEach(async () => {
  await syncFeeds(env.DB, [FEED_A]);
});

describe("collectFeeds — retention は実行されない", () => {
  it("古い記事が存在しても collectFeeds は pruned=0 を返す", async () => {
    // 100 日前の古い記事を挿入 (retention なら削除対象)
    const oldDate = new Date(Date.now() - 100 * 86400 * 1000).toISOString();
    await insertArticles(env.DB, [
      {
        guid: "old-article-for-retention",
        feed_id: "feed-retention-test",
        title: "Old Article",
        url: "https://x.test/retention/old",
        summary: null,
        author: null,
        published_at: oldDate,
        category: "bigtech",
        lang: "en",
      },
    ]);

    // 存在しない feedIds を渡すと activeFeeds が空になり、fetch は発生しない
    // pruned は collectFeeds 内では常に 0
    const result = await collectFeeds(env as unknown as Env, ["no-such-feed-id"]);

    expect(result.pruned).toBe(0);

    // 古い記事は削除されていないことを確認 (collectFeeds では retention を実行しないため)
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM articles WHERE guid = 'old-article-for-retention'",
    ).first<{ n: number }>();
    expect(row?.n).toBe(1);
  });
});
