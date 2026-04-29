import { env } from "cloudflare:test";
import { insertArticles } from "../../worker/db/articles";
import { syncFeeds } from "../../worker/db/feeds";
import type { FeedConfig } from "../../worker/types";

export const FEEDS: FeedConfig[] = [
  {
    id: "google-research",
    name: "Google Research",
    url: "https://x.test/g",
    category: "bigtech",
    lang: "en",
    enabled: true,
  },
  {
    id: "openai-blog",
    name: "OpenAI Blog",
    url: "https://x.test/o",
    category: "ai",
    lang: "en",
    enabled: true,
  },
];

/** 全 articles テストで共通の seed (3 件) を挿入する。setup.ts の reset() 後に呼ぶ。 */
export async function insertSampleArticles(): Promise<void> {
  await syncFeeds(env.DB, FEEDS);
  await insertArticles(env.DB, [
    {
      guid: "g-bt-1",
      feed_id: "google-research",
      title: "BigTech Article One",
      url: "https://x.test/g/1",
      summary: "Discusses LLM optimization",
      author: "Author A",
      published_at: "2024-04-01T00:00:00.000Z",
      category: "bigtech",
      lang: "en",
    },
    {
      guid: "o-ai-1",
      feed_id: "openai-blog",
      title: "AI Article One",
      url: "https://x.test/o/1",
      summary: "Discusses GPT",
      author: "Author B",
      published_at: "2024-04-02T00:00:00.000Z",
      category: "ai",
      lang: "en",
    },
    {
      guid: "o-ai-2",
      feed_id: "openai-blog",
      title: "AI Article Two",
      url: "https://x.test/o/2",
      summary: "Discusses DALL-E",
      author: "Author C",
      published_at: "2024-04-03T00:00:00.000Z",
      category: "ai",
      lang: "en",
    },
  ]);
}
