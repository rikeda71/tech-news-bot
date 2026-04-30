import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:test";
import { insertArticles, listArticles } from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import type { FeedConfig } from "../../../worker/types";

const FEEDS: FeedConfig[] = [
  {
    id: "feed-a",
    name: "Feed A",
    url: "https://a.test/rss",
    category: "bigtech",
    lang: "en",
    enabled: true,
  },
  {
    id: "feed-b",
    name: "Feed B",
    url: "https://b.test/rss",
    category: "ai",
    lang: "en",
    enabled: true,
  },
  {
    id: "feed-z",
    name: "Personal Feed",
    url: "https://zenn.dev/mizchi/feed",
    category: "personal",
    lang: "ja",
    enabled: true,
  },
];

beforeEach(async () => {
  await syncFeeds(env.DB, FEEDS);
});

describe("articles db", () => {
  it("inserts new rows and skips duplicates by guid", async () => {
    const inserted1 = await insertArticles(env.DB, [
      {
        guid: "g1",
        feed_id: "feed-a",
        title: "T1",
        url: "https://a.test/1",
        summary: "s1",
        author: null,
        published_at: "2024-03-01T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "g2",
        feed_id: "feed-a",
        title: "T2",
        url: "https://a.test/2",
        summary: null,
        author: null,
        published_at: "2024-03-02T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
    ]);
    expect(inserted1).toBe(2);

    const inserted2 = await insertArticles(env.DB, [
      {
        guid: "g1",
        feed_id: "feed-a",
        title: "T1 changed",
        url: "https://a.test/1",
        summary: "s1",
        author: null,
        published_at: "2024-03-01T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "g3",
        feed_id: "feed-b",
        title: "T3",
        url: "https://b.test/3",
        summary: null,
        author: null,
        published_at: "2024-03-03T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);
    expect(inserted2).toBe(1);
  });

  it("lists articles in published_at desc order with cursor pagination", async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      guid: `g${i}`,
      feed_id: "feed-a",
      title: `T${i}`,
      url: `https://a.test/${i}`,
      summary: null,
      author: null,
      published_at: `2024-04-0${i + 1}T00:00:00.000Z`,
      category: "bigtech" as const,
      lang: "en" as const,
    }));
    await insertArticles(env.DB, rows);

    const page1 = await listArticles(env.DB, { limit: 2, cursor: null });
    expect(page1.articles.map((a) => a.guid)).toEqual(["g4", "g3"]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listArticles(env.DB, { limit: 2, cursor: page1.nextCursor });
    expect(page2.articles.map((a) => a.guid)).toEqual(["g2", "g1"]);
  });

  it("filters by category and feed_id", async () => {
    await insertArticles(env.DB, [
      {
        guid: "ga",
        feed_id: "feed-a",
        title: "A",
        url: "https://a.test/x",
        summary: null,
        author: null,
        published_at: "2024-04-01T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "gb",
        feed_id: "feed-b",
        title: "B",
        url: "https://b.test/x",
        summary: null,
        author: null,
        published_at: "2024-04-02T00:00:00.000Z",
        category: "ai",
        lang: "en",
      },
    ]);

    const onlyAi = await listArticles(env.DB, { limit: 10, category: "ai" });
    expect(onlyAi.articles.map((a) => a.guid)).toEqual(["gb"]);

    const onlyFeedA = await listArticles(env.DB, { limit: 10, feedId: "feed-a" });
    expect(onlyFeedA.articles.map((a) => a.guid)).toEqual(["ga"]);
  });

  it("inserts and retrieves personal category articles", async () => {
    const inserted = await insertArticles(env.DB, [
      {
        guid: "gp1",
        feed_id: "feed-z",
        title: "個人ブログ記事 1",
        url: "https://zenn.dev/mizchi/articles/abc123",
        summary: "Zenn 個人ブログのサマリ",
        author: "mizchi",
        published_at: "2024-04-10T00:00:00.000Z",
        category: "personal",
        lang: "ja",
      },
      {
        guid: "gp2",
        feed_id: "feed-z",
        title: "個人ブログ記事 2",
        url: "https://zenn.dev/mizchi/articles/def456",
        summary: null,
        author: null,
        published_at: "2024-04-11T00:00:00.000Z",
        category: "personal",
        lang: "ja",
      },
    ]);
    expect(inserted).toBe(2);

    const onlyPersonal = await listArticles(env.DB, { limit: 10, category: "personal" });
    expect(onlyPersonal.articles.map((a) => a.guid)).toEqual(["gp2", "gp1"]);
    expect(onlyPersonal.articles[0].category).toBe("personal");
    expect(onlyPersonal.articles[0].lang).toBe("ja");
  });

  describe("FTS5 trigram Japanese full-text search", () => {
    beforeEach(async () => {
      // trigram は 3 文字以上の部分文字列に一致するため、日本語キーワードで検索できる
      await insertArticles(env.DB, [
        {
          guid: "fts-jp-1",
          feed_id: "feed-z",
          title: "東京で開催されるAIカンファレンス",
          url: "https://example.com/1",
          summary: "最新の機械学習と型安全なTypeScriptの活用事例を紹介",
          author: null,
          published_at: "2024-05-01T00:00:00.000Z",
          category: "ai",
          lang: "ja",
        },
        {
          guid: "fts-jp-2",
          feed_id: "feed-z",
          title: "メルカリのマイクロサービス設計",
          url: "https://example.com/2",
          summary: "Go言語とKubernetesを活用したスケーラブルなアーキテクチャ",
          author: null,
          published_at: "2024-05-02T00:00:00.000Z",
          category: "jp",
          lang: "ja",
        },
        {
          guid: "fts-en-1",
          feed_id: "feed-a",
          title: "TypeScript 5.5 release notes",
          url: "https://example.com/3",
          summary: "New features in TypeScript",
          author: null,
          published_at: "2024-05-03T00:00:00.000Z",
          category: "bigtech",
          lang: "en",
        },
      ]);
    });

    it("matches Japanese title with trigram query (東京で)", async () => {
      // trigram は 3 文字 N-gram なので、3 文字以上の部分文字列にのみ一致する
      // 「東京で」はタイトル「東京で開催されるAIカンファレンス」に含まれる
      const result = await listArticles(env.DB, { limit: 10, q: "東京で" });
      expect(result.articles.map((a) => a.guid)).toContain("fts-jp-1");
      expect(result.articles.map((a) => a.guid)).not.toContain("fts-jp-2");
    });

    it("matches Japanese title with trigram query (メルカリ)", async () => {
      const result = await listArticles(env.DB, { limit: 10, q: "メルカリ" });
      expect(result.articles.map((a) => a.guid)).toContain("fts-jp-2");
      expect(result.articles.map((a) => a.guid)).not.toContain("fts-jp-1");
    });

    it("matches Japanese summary with trigram query (型安全)", async () => {
      // summary に含まれる日本語の部分文字列でも検索できる
      const result = await listArticles(env.DB, { limit: 10, q: "型安全" });
      expect(result.articles.map((a) => a.guid)).toContain("fts-jp-1");
    });

    it("matches katakana keyword in Japanese title (AIカン)", async () => {
      // "AI" は 2 文字なので trigram では検索不可。3 文字以上の "AIカン" で検索する
      const result = await listArticles(env.DB, { limit: 10, q: "AIカン" });
      expect(result.articles.map((a) => a.guid)).toContain("fts-jp-1");
    });

    it("matches English keyword with trigram (TypeScript)", async () => {
      const result = await listArticles(env.DB, { limit: 10, q: "TypeScript" });
      // 英語記事と日本語 summary 両方にマッチする
      const guids = result.articles.map((a) => a.guid);
      expect(guids).toContain("fts-en-1");
      expect(guids).toContain("fts-jp-1");
    });

    it("returns empty when no article matches the query", async () => {
      const result = await listArticles(env.DB, { limit: 10, q: "該当なしのキーワード" });
      expect(result.articles).toHaveLength(0);
    });
  });
});
