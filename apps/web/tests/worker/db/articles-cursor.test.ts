import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:test";
import {
  appendCursorCondition,
  buildPaginatedQuery,
  extractWithCursor,
  insertArticles,
} from "../../../worker/db/articles";
import { syncFeeds } from "../../../worker/db/feeds";
import type { D1BindParameter } from "../../../worker/db/types";
import type { FeedConfig } from "../../../worker/types";
import type { Article } from "../../../worker/types";

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
];

beforeEach(async () => {
  await syncFeeds(env.DB, FEEDS);
});

describe("appendCursorCondition", () => {
  it("cursor が null の場合は conds / binds を変更しない", () => {
    // Arrange
    const conds: string[] = ["a.category = ?1"];
    const binds: D1BindParameter[] = ["bigtech"];

    // Act
    appendCursorCondition(conds, binds, null);

    // Assert
    expect.soft(conds).toHaveLength(1);
    expect.soft(binds).toHaveLength(1);
  });

  it("cursor が undefined の場合も conds / binds を変更しない", () => {
    // Arrange
    const conds: string[] = [];
    const binds: D1BindParameter[] = [];

    // Act
    appendCursorCondition(conds, binds, undefined);

    // Assert
    expect.soft(conds).toHaveLength(0);
    expect.soft(binds).toHaveLength(0);
  });

  it("cursor が存在する場合、keyset pagination 条件を追記する", () => {
    // Arrange
    const conds: string[] = ["a.category = ?1"];
    const binds: D1BindParameter[] = ["bigtech"];
    const cursor = { publishedAt: "2024-04-01T00:00:00.000Z", id: 42 };

    // Act
    appendCursorCondition(conds, binds, cursor);

    // Assert — ?2, ?3 で参照されていること (binds[0] が "bigtech" なので offset +1)
    expect.soft(conds).toHaveLength(2);
    expect.soft(conds[1]).toContain("?2");
    expect.soft(conds[1]).toContain("?3");
    expect.soft(binds).toEqual(["bigtech", cursor.publishedAt, cursor.id]);
  });

  it("binds が空の状態から cursor を追記すると ?1 / ?2 から始まる", () => {
    // Arrange
    const conds: string[] = [];
    const binds: D1BindParameter[] = [];
    const cursor = { publishedAt: "2024-05-01T00:00:00.000Z", id: 10 };

    // Act
    appendCursorCondition(conds, binds, cursor);

    // Assert
    expect.soft(conds[0]).toContain("?1");
    expect.soft(conds[0]).toContain("?2");
    expect.soft(binds).toEqual([cursor.publishedAt, cursor.id]);
  });
});

describe("extractWithCursor", () => {
  const makeArticle = (id: number, publishedAt: string): Article =>
    ({
      id,
      guid: `g${id}`,
      feed_id: "feed-a",
      feed_name: "Feed A",
      title: `T${id}`,
      url: `https://a.test/${id}`,
      summary: null,
      author: null,
      published_at: publishedAt,
      fetched_at: publishedAt,
      category: "bigtech",
      lang: "en",
    }) as Article;

  it("rows が limit 以下なら nextCursor は null", () => {
    // Arrange
    const rows = [
      makeArticle(3, "2024-04-03T00:00:00.000Z"),
      makeArticle(2, "2024-04-02T00:00:00.000Z"),
    ];

    // Act
    const { articles, nextCursor } = extractWithCursor(rows, 3);

    // Assert
    expect.soft(articles).toHaveLength(2);
    expect.soft(nextCursor).toBeNull();
  });

  it("rows が limit+1 件なら最後の要素を切り落として nextCursor を生成する", () => {
    // Arrange — limit=2 に対して 3 件 (limit+1) を渡す
    const rows = [
      makeArticle(3, "2024-04-03T00:00:00.000Z"),
      makeArticle(2, "2024-04-02T00:00:00.000Z"),
      makeArticle(1, "2024-04-01T00:00:00.000Z"),
    ];

    // Act
    const { articles, nextCursor } = extractWithCursor(rows, 2);

    // Assert
    expect.soft(articles).toHaveLength(2);
    expect.soft(articles.map((a) => a.id)).toEqual([3, 2]);
    expect.soft(nextCursor).not.toBeNull();
    expect.soft(nextCursor?.publishedAt).toBe("2024-04-02T00:00:00.000Z");
    expect.soft(nextCursor?.id).toBe(2);
  });

  it("rows が空配列の場合は articles が空で nextCursor が null", () => {
    // Arrange / Act
    const { articles, nextCursor } = extractWithCursor([], 10);

    // Assert
    expect.soft(articles).toHaveLength(0);
    expect.soft(nextCursor).toBeNull();
  });
});

describe("buildPaginatedQuery (実 D1 ベース)", () => {
  const SEED_ARTICLES = Array.from({ length: 5 }, (_, i) => ({
    guid: `bpq-g${i + 1}`,
    feed_id: "feed-a",
    title: `BPQ T${i + 1}`,
    url: `https://a.test/bpq/${i + 1}`,
    summary: null,
    author: null,
    published_at: `2024-06-0${i + 1}T00:00:00.000Z`,
    category: "bigtech" as const,
    lang: "en" as const,
  }));

  beforeEach(async () => {
    await insertArticles(env.DB, SEED_ARTICLES);
  });

  it("cursor なしで baseConds のみ: 全件が DESC 順に取得できる", async () => {
    // Arrange
    const { sql, binds } = buildPaginatedQuery({
      baseConds: [`a.feed_id = ?1`],
      baseBinds: ["feed-a"],
      limit: 10,
      cursor: null,
    });

    // Act
    const result = await env.DB.prepare(sql)
      .bind(...binds)
      .all<{ guid: string }>();

    // Assert
    const guids = result.results.map((r) => r.guid);
    expect.soft(guids).toEqual(["bpq-g5", "bpq-g4", "bpq-g3", "bpq-g2", "bpq-g1"]);
  });

  it("limit を 2 にすると binds の末尾に limit+1 (3) が付く", () => {
    // Arrange / Act
    const { binds } = buildPaginatedQuery({
      baseConds: [],
      baseBinds: [],
      limit: 2,
      cursor: null,
    });

    // Assert — limit+1 = 3 が最後の bind になっていること
    expect.soft(binds[binds.length - 1]).toBe(3);
  });

  it("cursor 付きで pagination が正しく動作する", async () => {
    // Arrange — 1 ページ目 (limit=2)
    const page1Query = buildPaginatedQuery({
      baseConds: [`a.feed_id = ?1`],
      baseBinds: ["feed-a"],
      limit: 2,
      cursor: null,
    });
    const page1Raw = await env.DB.prepare(page1Query.sql)
      .bind(...page1Query.binds)
      .all<Article>();

    // limit+1 件取得して extractWithCursor でカーソルを生成
    const { articles: page1Articles, nextCursor } = extractWithCursor(page1Raw.results, 2);
    expect.soft(page1Articles.map((a) => a.guid)).toEqual(["bpq-g5", "bpq-g4"]);
    expect.soft(nextCursor).not.toBeNull();

    // Act — 2 ページ目 (cursor 付き)
    const page2Query = buildPaginatedQuery({
      baseConds: [`a.feed_id = ?1`],
      baseBinds: ["feed-a"],
      limit: 2,
      cursor: nextCursor,
    });
    const page2Raw = await env.DB.prepare(page2Query.sql)
      .bind(...page2Query.binds)
      .all<Article>();
    const { articles: page2Articles } = extractWithCursor(page2Raw.results, 2);

    // Assert
    expect.soft(page2Articles.map((a) => a.guid)).toEqual(["bpq-g3", "bpq-g2"]);
  });

  it("複数の baseConds を AND で結合する", async () => {
    // Arrange — feed-a (bigtech) の記事のみ絞り込む
    const { sql, binds } = buildPaginatedQuery({
      baseConds: [`a.feed_id = ?1`, `a.category = ?2`],
      baseBinds: ["feed-a", "bigtech"],
      limit: 10,
      cursor: null,
    });

    // Act
    const result = await env.DB.prepare(sql)
      .bind(...binds)
      .all<{ guid: string }>();

    // Assert — 全 5 件 feed-a かつ bigtech
    expect.soft(result.results).toHaveLength(5);
  });
});
