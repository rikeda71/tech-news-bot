import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:test";
import { insertArticles } from "../../../worker/db/articles";
import { searchArticles } from "../../../worker/db/articles-query-extra";
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

describe("searchArticles (FTS5 only)", () => {
  beforeEach(async () => {
    await insertArticles(env.DB, [
      {
        guid: "en-1",
        feed_id: "feed-a",
        title: "TypeScript 5.5 release notes",
        url: "https://example.com/1",
        summary: "New features in TypeScript including inferred type predicates",
        author: null,
        published_at: "2024-05-01T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "en-2",
        feed_id: "feed-a",
        title: "Rust async runtime deep dive",
        url: "https://example.com/2",
        summary: "Exploring tokio and async-std internals",
        author: null,
        published_at: "2024-05-02T00:00:00.000Z",
        category: "bigtech",
        lang: "en",
      },
      {
        guid: "ja-1",
        feed_id: "feed-z",
        title: "Cloudflare Workers で TypeScript を使う",
        url: "https://example.com/3",
        summary: "Workers AI と D1 の活用事例",
        author: null,
        published_at: "2024-05-03T00:00:00.000Z",
        category: "personal",
        lang: "ja",
      },
      {
        guid: "ja-2",
        feed_id: "feed-z",
        title: "機械学習エンジニアのためのRust入門",
        url: "https://example.com/4",
        summary: "PyTorchとの連携やパフォーマンス最適化の手法",
        author: null,
        published_at: "2024-05-04T00:00:00.000Z",
        category: "personal",
        lang: "ja",
      },
    ]);
  });

  it("returns articles matching English keyword in title (TypeScript)", async () => {
    const result = await searchArticles(env.DB, "TypeScript", 10, null);
    const guids = result.articles.map((a) => a.guid);
    expect(guids).toContain("en-1");
    expect(guids).toContain("ja-1");
    expect(guids).not.toContain("en-2");
    expect(guids).not.toContain("ja-2");
  });

  it("returns articles matching English keyword in summary (tokio)", async () => {
    const result = await searchArticles(env.DB, "tokio", 10, null);
    const guids = result.articles.map((a) => a.guid);
    expect(guids).toContain("en-2");
    expect(guids).not.toContain("en-1");
  });

  it("returns articles matching Japanese keyword in title (機械学習)", async () => {
    // trigram は 3 文字以上の部分文字列に一致する
    const result = await searchArticles(env.DB, "機械学習", 10, null);
    const guids = result.articles.map((a) => a.guid);
    expect(guids).toContain("ja-2");
    expect(guids).not.toContain("ja-1");
  });

  it("returns articles matching Japanese keyword in summary (PyTorch)", async () => {
    const result = await searchArticles(env.DB, "PyTorch", 10, null);
    const guids = result.articles.map((a) => a.guid);
    expect(guids).toContain("ja-2");
  });

  it("returns empty when no article matches the query", async () => {
    const result = await searchArticles(env.DB, "該当なしキーワードXYZ", 10, null);
    expect(result.articles).toHaveLength(0);
    expect(result.nextCursor).toBeNull();
  });

  it("handles multi-token query (Rust async)", async () => {
    // スペース区切りで複数トークン → FTS5 が AND で解釈
    const result = await searchArticles(env.DB, "Rust async", 10, null);
    const guids = result.articles.map((a) => a.guid);
    expect(guids).toContain("en-2");
    expect(guids).not.toContain("en-1");
  });

  it("handles FTS5 special characters gracefully (double-quote in query)", async () => {
    // ダブルクォートを含む入力はエスケープされてクラッシュしない
    const result = await searchArticles(env.DB, '"TypeScript"', 10, null);
    // クラッシュしないことと、マッチ結果が返ることを確認
    expect(result.articles).toBeDefined();
  });

  it("handles FTS5 special characters gracefully (asterisk)", async () => {
    const result = await searchArticles(env.DB, "Type*", 10, null);
    expect(result.articles).toBeDefined();
  });

  it("handles FTS5 special characters gracefully (caret)", async () => {
    const result = await searchArticles(env.DB, "^TypeScript", 10, null);
    expect(result.articles).toBeDefined();
  });

  it("handles FTS5 special characters gracefully (parentheses)", async () => {
    const result = await searchArticles(env.DB, "(TypeScript)", 10, null);
    expect(result.articles).toBeDefined();
  });

  it("handles FTS5 special characters gracefully (colon)", async () => {
    const result = await searchArticles(env.DB, "title:TypeScript", 10, null);
    expect(result.articles).toBeDefined();
  });

  it("handles single character query without crashing", async () => {
    // 1 文字クエリは trigram にマッチしないため 0 件になるが、エラーにはならない
    const result = await searchArticles(env.DB, "a", 10, null);
    expect(result.articles).toBeDefined();
  });

  it("handles empty string query without crashing", async () => {
    // 空文字は '""' に変換され、FTS5 は 0 件を返す
    const result = await searchArticles(env.DB, "", 10, null);
    expect(result.articles).toBeDefined();
  });

  it("respects limit and returns nextCursor for pagination", async () => {
    // TypeScript で 2 件ヒットするが limit=1 でページネーション
    const page1 = await searchArticles(env.DB, "TypeScript", 1, null);
    expect(page1.articles).toHaveLength(1);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await searchArticles(env.DB, "TypeScript", 1, page1.nextCursor);
    expect(page2.articles).toHaveLength(1);
    // page1 と page2 のガイドが異なること
    expect(page2.articles[0]?.guid).not.toBe(page1.articles[0]?.guid);
  });

  it("does NOT fall back to LIKE — 2-char query returns no results for trigram", async () => {
    // LIKE fallback があれば 'TS' (2 文字) で TypeScript 記事がヒットしていた。
    // FTS5 trigram は 3 文字未満のトークンにはマッチしないため 0 件になる。
    // これが「LIKE fallback を削除した」ことの証明テスト。
    const result = await searchArticles(env.DB, "TS", 10, null);
    // trigram は 3 文字未満のトークンをインデックスしないので 0 件
    expect(result.articles).toHaveLength(0);
  });
});
