/**
 * feedWriter.ts の単体テスト
 *
 * handleNotModified / handleSuccess / handleError の各ブランチを独立して検証する。
 * 古典派: 実 D1 (miniflare) を使い、過剰モックを避ける。
 * handleSuccess / handleNotModified は XML を直接受け取るため fetch は呼ばれない。
 * handleError も fetch を発行しないため、ここでは外部アクセスのモックは不要。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:test";
import {
  handleError,
  handleNotModified,
  handleSuccess,
} from "../../../worker/collector/feedWriter";
import { D1CostAccumulator } from "../../../worker/collector/metrics";
import { syncFeeds } from "../../../worker/db/feeds";
import { startRun } from "../../../worker/db/runs";
import type { FeedConfig } from "../../../worker/types";

const FEED: FeedConfig = {
  id: "fw-test-feed",
  name: "FeedWriter Test Feed",
  url: "https://example.com/fw.xml",
  category: "bigtech",
  lang: "en",
  enabled: true,
};

const VALID_RSS = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>FW Test</title>
    <item>
      <title>Article 1</title>
      <link>https://example.com/a1</link>
      <guid>https://example.com/a1</guid>
      <pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Article 2</title>
      <link>https://example.com/a2</link>
      <guid>https://example.com/a2</guid>
      <pubDate>Thu, 02 Jan 2026 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

beforeEach(async () => {
  await syncFeeds(env.DB, [FEED]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// テスト用にパラメータを組み立てるヘルパー
function makeParams(runId: number | null = null) {
  return {
    env,
    feed: FEED,
    fetchedAt: new Date().toISOString(),
    runId,
    feedStart: Date.now(),
    t0: performance.now(),
    d1Acc: new D1CostAccumulator(),
  };
}

// -----------------------------------------------------------------------
// handleNotModified
// -----------------------------------------------------------------------
describe("handleNotModified", () => {
  it("returns not_modified result with inserted=0 and parsed=0", async () => {
    const p = makeParams();
    const result = await handleNotModified(
      p.env,
      FEED.id,
      p.fetchedAt,
      p.runId,
      p.feedStart,
      p.t0,
      p.d1Acc,
    );

    expect.soft(result.status).toBe("not_modified");
    expect.soft(result.inserted).toBe(0);
    expect.soft(result.parsed).toBe(0);
    expect.soft(result.feedId).toBe(FEED.id);
  });

  it("records last_fetched_at in feeds table", async () => {
    const p = makeParams();
    await handleNotModified(p.env, FEED.id, p.fetchedAt, p.runId, p.feedStart, p.t0, p.d1Acc);

    const row = await env.DB.prepare("SELECT last_fetched_at, last_status FROM feeds WHERE id = ?1")
      .bind(FEED.id)
      .first<{ last_fetched_at: string; last_status: string }>();

    expect.soft(row?.last_fetched_at).toBe(p.fetchedAt);
    expect.soft(row?.last_status).toBe("not_modified");
  });

  it("records run feed entry as 'skipped' when runId is provided", async () => {
    const { run_id } = await startRun(env.DB, new Date().toISOString(), 1);
    const p = makeParams(run_id);
    await handleNotModified(p.env, FEED.id, p.fetchedAt, run_id, p.feedStart, p.t0, p.d1Acc);

    const row = await env.DB.prepare(
      "SELECT status, articles_inserted FROM collector_run_feeds WHERE run_id = ?1 AND feed_id = ?2",
    )
      .bind(run_id, FEED.id)
      .first<{ status: string; articles_inserted: number }>();

    expect.soft(row?.status).toBe("skipped");
    expect.soft(row?.articles_inserted).toBe(0);
  });

  it("skips run feed recording when runId is null", async () => {
    const p = makeParams(null);
    await handleNotModified(p.env, FEED.id, p.fetchedAt, null, p.feedStart, p.t0, p.d1Acc);

    // collector_run_feeds には何も挿入されていない
    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM collector_run_feeds").first<{
      n: number;
    }>();
    expect(count?.n).toBe(0);
  });
});

// -----------------------------------------------------------------------
// handleSuccess
// -----------------------------------------------------------------------
describe("handleSuccess", () => {
  it("returns ok result with correct inserted and parsed counts", async () => {
    const p = makeParams();
    const result = await handleSuccess(
      p.env,
      FEED,
      VALID_RSS,
      '"etag-v1"',
      "Thu, 01 Jan 2026 00:00:00 GMT",
      p.fetchedAt,
      500,
      p.runId,
      p.feedStart,
      p.t0,
      p.d1Acc,
    );

    expect.soft(result.status).toBe("ok");
    expect.soft(result.feedId).toBe(FEED.id);
    expect.soft(result.inserted).toBe(2);
    expect.soft(result.parsed).toBe(2);
  });

  it("inserts articles into the DB", async () => {
    const p = makeParams();
    await handleSuccess(
      p.env,
      FEED,
      VALID_RSS,
      null,
      null,
      p.fetchedAt,
      500,
      p.runId,
      p.feedStart,
      p.t0,
      p.d1Acc,
    );

    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE feed_id = ?1")
      .bind(FEED.id)
      .first<{ n: number }>();
    expect(count?.n).toBe(2);
  });

  it("saves etag and last_modified in feeds table", async () => {
    const p = makeParams();
    const etag = '"etag-abc"';
    const lastModified = "Mon, 05 Jan 2026 12:00:00 GMT";
    await handleSuccess(
      p.env,
      FEED,
      VALID_RSS,
      etag,
      lastModified,
      p.fetchedAt,
      500,
      p.runId,
      p.feedStart,
      p.t0,
      p.d1Acc,
    );

    const row = await env.DB.prepare("SELECT last_etag, last_modified FROM feeds WHERE id = ?1")
      .bind(FEED.id)
      .first<{ last_etag: string; last_modified: string }>();

    expect.soft(row?.last_etag).toBe(etag);
    expect.soft(row?.last_modified).toBe(lastModified);
  });

  it("does not insert duplicate articles on second call", async () => {
    const p = makeParams();
    await handleSuccess(
      p.env,
      FEED,
      VALID_RSS,
      null,
      null,
      p.fetchedAt,
      500,
      p.runId,
      p.feedStart,
      p.t0,
      p.d1Acc,
    );

    // 2 回目は重複のため inserted=0
    const p2 = makeParams();
    const result2 = await handleSuccess(
      p2.env,
      FEED,
      VALID_RSS,
      null,
      null,
      p2.fetchedAt,
      500,
      p2.runId,
      p2.feedStart,
      p2.t0,
      p2.d1Acc,
    );

    expect.soft(result2.inserted).toBe(0);
    expect.soft(result2.parsed).toBe(2);
  });

  it("records run feed entry as 'ok' with inserted count when runId is provided", async () => {
    const { run_id } = await startRun(env.DB, new Date().toISOString(), 1);
    const p = makeParams(run_id);
    await handleSuccess(
      p.env,
      FEED,
      VALID_RSS,
      null,
      null,
      p.fetchedAt,
      500,
      run_id,
      p.feedStart,
      p.t0,
      p.d1Acc,
    );

    const row = await env.DB.prepare(
      "SELECT status, articles_inserted FROM collector_run_feeds WHERE run_id = ?1 AND feed_id = ?2",
    )
      .bind(run_id, FEED.id)
      .first<{ status: string; articles_inserted: number }>();

    expect.soft(row?.status).toBe("ok");
    expect.soft(row?.articles_inserted).toBe(2);
  });
});

// -----------------------------------------------------------------------
// handleError
// -----------------------------------------------------------------------
describe("handleError", () => {
  it("returns error result with correct error message and errorKind", async () => {
    const p = makeParams();
    const err = new Error("HTTP 503 Service Unavailable");
    const result = await handleError(
      p.env,
      FEED.id,
      err,
      p.fetchedAt,
      p.runId,
      p.feedStart,
      p.t0,
      p.d1Acc,
    );

    expect.soft(result.status).toBe("error");
    expect.soft(result.feedId).toBe(FEED.id);
    expect.soft(result.inserted).toBe(0);
    expect.soft(result.parsed).toBe(0);
    if (result.status !== "error") throw new Error("expected status error");
    expect.soft(result.error).toContain("HTTP 503");
    expect.soft(result.errorKind).toBe("http_server");
  });

  it("classifies network error correctly", async () => {
    const p = makeParams();
    const err = new TypeError("Failed to fetch");
    const result = await handleError(
      p.env,
      FEED.id,
      err,
      p.fetchedAt,
      p.runId,
      p.feedStart,
      p.t0,
      p.d1Acc,
    );

    expect(result.status).toBe("error");
    if (result.status !== "error") throw new Error("expected status error");
    expect.soft(result.errorKind).toBe("network");
  });

  it("records consecutive_failures increment in feeds table", async () => {
    const p = makeParams();
    const err = new Error("HTTP 500 Internal Server Error");
    await handleError(p.env, FEED.id, err, p.fetchedAt, p.runId, p.feedStart, p.t0, p.d1Acc);

    const row = await env.DB.prepare(
      "SELECT consecutive_failures, last_status FROM feeds WHERE id = ?1",
    )
      .bind(FEED.id)
      .first<{ consecutive_failures: number; last_status: string }>();

    expect.soft(row?.consecutive_failures).toBe(1);
    expect.soft(row?.last_status).toBe("error");
  });

  it("records run feed entry as 'failed' when runId is provided", async () => {
    const { run_id } = await startRun(env.DB, new Date().toISOString(), 1);
    const p = makeParams(run_id);
    const err = new Error("HTTP 404 Not Found");
    await handleError(p.env, FEED.id, err, p.fetchedAt, run_id, p.feedStart, p.t0, p.d1Acc);

    const row = await env.DB.prepare(
      "SELECT status FROM collector_run_feeds WHERE run_id = ?1 AND feed_id = ?2",
    )
      .bind(run_id, FEED.id)
      .first<{ status: string }>();

    expect(row?.status).toBe("failed");
  });

  it("skips run feed recording when runId is null", async () => {
    const p = makeParams(null);
    const err = new Error("HTTP 503 Service Unavailable");
    await handleError(p.env, FEED.id, err, p.fetchedAt, null, p.feedStart, p.t0, p.d1Acc);

    const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM collector_run_feeds").first<{
      n: number;
    }>();
    expect(count?.n).toBe(0);
  });
});
