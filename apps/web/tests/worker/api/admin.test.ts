import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env, SELF } from "cloudflare:test";
import { syncFeeds } from "../../../worker/db/feeds";
import { finishRun, listRuns, recordRunFeed, startRun } from "../../../worker/db/runs";
import type { FeedConfig } from "../../../worker/types";

const TEST_FEED: FeedConfig = {
  id: "test-feed",
  name: "Test Feed",
  url: "https://example.com/feed.xml",
  category: "bigtech",
  lang: "en",
  enabled: true,
};

const AUTH_HEADER = { authorization: "Bearer test-admin-token" };

// feeds.yaml に実在する ID (テスト環境でも loadAllFeeds() から参照される)
const REAL_FEED_ID = "google-research";

beforeEach(async () => {
  await syncFeeds(env.DB, [TEST_FEED]);
});

describe("POST /api/admin/feeds/:id/enabled", () => {
  it("200: toggles enabled to false", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/test-feed/enabled", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    const body = (await res.json()) as { id: string; enabled: boolean };
    expect.soft(res.status).toBe(200);
    expect.soft(body.id).toBe("test-feed");
    expect.soft(body.enabled).toBe(false);
  });

  it("200: toggles enabled back to true", async () => {
    // disable first
    await SELF.fetch("https://example.com/api/admin/feeds/test-feed/enabled", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    const res = await SELF.fetch("https://example.com/api/admin/feeds/test-feed/enabled", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
    const body = (await res.json()) as { id: string; enabled: boolean };
    expect.soft(res.status).toBe(200);
    expect.soft(body.enabled).toBe(true);
  });

  it("401: rejects unauthenticated request", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/test-feed/enabled", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(401);
  });

  it("401: rejects invalid token", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/test-feed/enabled", {
      method: "POST",
      headers: { authorization: "Bearer wrong-token", "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(401);
  });

  it("404: returns not found for unknown feed id", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/no-such-feed/enabled", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect(res.status).toBe(404);
  });

  it("400: rejects body without enabled field", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/test-feed/enabled", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });
    expect(res.status).toBe(400);
  });

  it("400: rejects body with non-boolean enabled", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/feeds/test-feed/enabled", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ enabled: "true" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/collector/run", () => {
  it("200: 認証 OK + body なし (全件実行) → results 配列を返す", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collector/run", {
      method: "POST",
      headers: { ...AUTH_HEADER },
    });
    const body = (await res.json()) as {
      started_at: string;
      finished_at: string;
      results: { feed_id: string; status: string; new_articles: number }[];
    };
    expect.soft(res.status).toBe(200);
    expect.soft(typeof body.started_at).toBe("string");
    expect.soft(typeof body.finished_at).toBe("string");
    expect.soft(Array.isArray(body.results)).toBe(true);
    // 全 enabled feed に対して results が返る (外部 fetch はテスト環境では失敗するが error として返る)
    expect.soft(body.results.length).toBeGreaterThan(0);
    for (const r of body.results) {
      expect.soft(typeof r.feed_id).toBe("string");
      expect.soft(["ok", "error", "not_modified"]).toContain(r.status);
      expect.soft(typeof r.new_articles).toBe("number");
    }
  }, 60_000);

  it("200: /collector/run 経由でも collector_runs に run が記録される", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collector/run", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ feed_ids: [REAL_FEED_ID] }),
    });
    expect(res.status).toBe(200);

    // 同期実行なので応答が返った時点で collector_runs に行が存在するはず
    const runs = await listRuns(env.DB, 10);
    // 最新 run は completed_at が設定されている
    expect(runs.length).toBeGreaterThan(0);
    const latest = runs[0];
    expect.soft(latest.completed_at).toBeTruthy();
  }, 60_000);

  it("401: 認証なし → 401", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collector/run", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("200: feed_ids 指定 → 指定 feed のみ results に含まれる", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collector/run", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ feed_ids: [REAL_FEED_ID] }),
    });
    const body = (await res.json()) as {
      started_at: string;
      finished_at: string;
      results: { feed_id: string }[];
    };
    expect.soft(res.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect.soft(body.results[0].feed_id).toBe(REAL_FEED_ID);
  });

  it("400: 不明な feed_id を指定 → 400", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collector/run", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ feed_ids: ["unknown-id-xyz"] }),
    });
    const body = (await res.json()) as { error: string };
    expect.soft(res.status).toBe(400);
    expect.soft(body.error).toMatch(/unknown feed_ids/);
  });

  it("400: feed_ids が配列でない → 400", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collector/run", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ feed_ids: "google-research" }),
    });
    const body = (await res.json()) as { error: string };
    expect.soft(res.status).toBe(400);
    expect.soft(body.error).toBe("feed_ids must be an array of strings");
  });
});

describe("POST /api/admin/collect", () => {
  it("401: トークンなし → 401", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collect", {
      method: "POST",
    });
    expect(res.status).toBe(401);
  });

  it("401: 不正トークン → 401", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collect", {
      method: "POST",
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });

  it("400: 不正 JSON → 400", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collect", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: "{ invalid json",
    });
    const body = (await res.json()) as { error: string };
    expect.soft(res.status).toBe(400);
    expect.soft(body.error).toBe("invalid JSON body");
  });

  it("404: 存在しない feed_id → 404", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collect", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ feed_id: "no-such-feed-xyz" }),
    });
    const body = (await res.json()) as { error: string };
    expect.soft(res.status).toBe(404);
    expect.soft(body.error).toMatch(/feed not found/);
  });

  it("200: body なし (全件) → ok=true と run_id と async=true を返す", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collect", {
      method: "POST",
      headers: { ...AUTH_HEADER },
    });
    const body = (await res.json()) as { ok: boolean; run_id: number; async: boolean };
    expect.soft(res.status).toBe(200);
    expect.soft(body.ok).toBe(true);
    expect.soft(typeof body.run_id).toBe("number");
    expect.soft(body.async).toBe(true);

    // waitUntil の完了 (completed_at が設定される) を待ち、collector_runs に行が作られていることを確認する。
    // 完了を待つことで次テストの beforeEach(reset) との競合を防ぐ。
    const runId = body.run_id;
    const deadline = Date.now() + 25_000;
    let runs: Awaited<ReturnType<typeof listRuns>> = [];
    while (Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 500));
      runs = await listRuns(env.DB, 10);
      const created = runs.find((r) => r.id === runId);
      if (created?.completed_at) break;
    }
    expect(runs.length).toBeGreaterThan(0);
    const created = runs.find((r) => r.id === runId);
    expect(created).toBeDefined();
    expect(created?.completed_at).toBeTruthy();
  }, 30_000);

  it("200: feed_id 指定 → ok=true と run_id を返し collector_run_feeds に該当 feed のみ記録される", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/collect", {
      method: "POST",
      headers: { ...AUTH_HEADER, "content-type": "application/json" },
      body: JSON.stringify({ feed_id: REAL_FEED_ID }),
    });
    const body = (await res.json()) as { ok: boolean; run_id: number; async: boolean };
    expect.soft(res.status).toBe(200);
    expect.soft(body.ok).toBe(true);
    expect.soft(typeof body.run_id).toBe("number");
    expect.soft(body.async).toBe(true);

    // waitUntil が完了するまでポーリングして collector_run_feeds を確認する。
    // テスト環境では waitUntil は外部 fetch のタイムアウト後に完了する。
    const runId = body.run_id;
    const deadline = Date.now() + 25_000;
    let detail: { results: { feed_id: string }[] } | null = null;
    while (Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 500));
      detail = await env.DB.prepare("SELECT * FROM collector_run_feeds WHERE run_id = ?1")
        .bind(runId)
        .all<{ feed_id: string }>();
      if (detail.results.length > 0) break;
    }
    // 指定した feed_id の記録が存在し、他の feed は含まれていないことを確認する
    expect(detail?.results.length).toBeGreaterThanOrEqual(1);
    const feedIds = detail?.results.map((r) => r.feed_id) ?? [];
    expect(feedIds).toContain(REAL_FEED_ID);
    // feedIds フィルタが有効であれば REAL_FEED_ID 以外は記録されない
    const unexpected = feedIds.filter((id) => id !== REAL_FEED_ID);
    expect(unexpected).toHaveLength(0);
  }, 30_000);
});

describe("GET /api/admin/runs", () => {
  it("200: returns empty runs array when no runs exist", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/runs", {
      headers: AUTH_HEADER,
    });
    const body = (await res.json()) as { runs: unknown[] };
    expect.soft(res.status).toBe(200);
    expect.soft(Array.isArray(body.runs)).toBe(true);
    expect.soft(body.runs).toHaveLength(0);
  });

  it("200: returns runs list", async () => {
    const { run_id } = await startRun(env.DB, "2024-04-01T00:00:00.000Z", 3);
    await finishRun(env.DB, run_id, "2024-04-01T00:00:10.000Z", 2, 1, 15);

    const res = await SELF.fetch("https://example.com/api/admin/runs", {
      headers: AUTH_HEADER,
    });
    const body = (await res.json()) as { runs: { id: number; feeds_ok: number }[] };
    expect.soft(res.status).toBe(200);
    expect(body.runs).toHaveLength(1);
    expect.soft(body.runs[0].id).toBe(run_id);
    expect.soft(body.runs[0].feeds_ok).toBe(2);
  });

  it("200: clamps limit to max 100", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/runs?limit=9999", {
      headers: AUTH_HEADER,
    });
    expect(res.status).toBe(200);
  });

  it("401: rejects unauthenticated request", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/runs");
    expect(res.status).toBe(401);
  });

  it("401: rejects invalid token", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/runs", {
      headers: { authorization: "Bearer wrong-token" },
    });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/admin/runs/:id", () => {
  it("200: returns run detail with feeds, duration_ms, and Cache-Control", async () => {
    const { run_id } = await startRun(env.DB, "2024-04-05T00:00:00.000Z", 2);
    await recordRunFeed(env.DB, run_id, "feed-a", "ok", 10, 800);
    await recordRunFeed(env.DB, run_id, "feed-b", "failed", 0, 200, "HTTP 500");
    await finishRun(env.DB, run_id, "2024-04-05T00:00:05.000Z", 1, 1, 10);

    const res = await SELF.fetch(`https://example.com/api/admin/runs/${run_id}`, {
      headers: AUTH_HEADER,
    });
    const body = (await res.json()) as {
      run: { id: number; feeds_ok: number; duration_ms: number | null };
      feeds: { feed_id: string; status: string; error: string | null }[];
    };
    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("cache-control")).toBe("private, max-age=30");
    expect.soft(body.run.id).toBe(run_id);
    expect.soft(body.run.feeds_ok).toBe(1);
    // 5s = 5000ms
    expect.soft(body.run.duration_ms).toBe(5000);
    expect(body.feeds).toHaveLength(2);
    const feedA = body.feeds.find((f) => f.feed_id === "feed-a");
    expect.soft(feedA!.status).toBe("ok");
    const feedB = body.feeds.find((f) => f.feed_id === "feed-b");
    expect.soft(feedB!.status).toBe("failed");
    expect.soft(feedB!.error).toBe("HTTP 500");
  });

  it("200: duration_ms is null when run is not yet completed", async () => {
    const { run_id } = await startRun(env.DB, "2024-04-05T00:00:00.000Z", 2);

    const res = await SELF.fetch(`https://example.com/api/admin/runs/${run_id}`, {
      headers: AUTH_HEADER,
    });
    const body = (await res.json()) as {
      run: { id: number; duration_ms: number | null };
      feeds: unknown[];
    };
    expect.soft(res.status).toBe(200);
    expect.soft(body.run.id).toBe(run_id);
    expect.soft(body.run.duration_ms).toBeNull();
    expect.soft(body.feeds).toHaveLength(0);
  });

  it("404: returns 'run not found' for unknown id", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/runs/99999", {
      headers: AUTH_HEADER,
    });
    const body = (await res.json()) as { error: string };
    expect.soft(res.status).toBe(404);
    expect.soft(body.error).toBe("run not found");
  });

  it("401: rejects unauthenticated request", async () => {
    const res = await SELF.fetch("https://example.com/api/admin/runs/1");
    expect(res.status).toBe(401);
  });
});
