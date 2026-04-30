import type { Env } from "../types";
import { loadEnabledFeeds } from "../feed-config";
import { parseXml, pickText, asArray } from "../utils/xml";
import { checkUrlSafety } from "./url-safety";
import { D1CostAccumulator, writeD1CostEvent } from "./metrics";
import { maybeAlert, sendAlert } from "./alert";
import {
  getFeedStreaks,
  loadEnabledFeedIdsAndHeaders,
  syncFeeds,
  type FeedHeaders,
} from "../db/feeds";
import { finishRun, startRun } from "../db/runs";
import {
  classifyError,
  type CollectAllResult,
  type CollectErrorKind,
  type CollectResult,
} from "./collectTypes";
import { fetchFeed, isRetryableError } from "./fetcher";
import { collectFeed } from "./feedWriter";

export type { CollectErrorKind, CollectResult, CollectAllResult };
export { classifyError, isRetryableError, fetchFeed };

export type ValidateFeedResult =
  | { ok: true; title: string; lang: string | null; item_count: number }
  | { ok: false; error: string };

/**
 * URL を fetch + parse して RSS/Atom として有効かどうかを検証する。
 * feeds.yaml に追記する前の事前確認用。DB アクセスは行わない。
 * タイムアウトは 10s (admin endpoint 側で 12s でラップする)。
 * SSRF 対策として内部 IP / 特殊用途ホストへのアクセスは事前にブロックする。
 */
export async function validateFeedUrl(url: string): Promise<ValidateFeedResult> {
  // fetch より前に SSRF チェックを行い、内部 IP やプライベートホストを拒否する
  const safety = checkUrlSafety(url);
  if (!safety.ok) {
    return { ok: false, error: `unsafe URL: ${safety.reason}` };
  }

  let result: Awaited<ReturnType<typeof fetchFeed>>;
  try {
    // retry なし (検証用なので 1 回で判断する)
    result = await fetchFeed(url, 10_000, 0);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (result.notModified || result.xml === null) {
    // 304 は通常ありえないが念のため
    return { ok: false, error: "unexpected 304 Not Modified" };
  }

  const root = parseXml(result.xml) as Record<string, unknown>;
  if (!root || typeof root !== "object") {
    return { ok: false, error: "failed to parse XML" };
  }

  // RSS 2.0 / RDF 1.0
  const rss = root["rss"] as Record<string, unknown> | undefined;
  const rdf = root["rdf:RDF"] as Record<string, unknown> | undefined;
  const atomFeed = root["feed"] as Record<string, unknown> | undefined;

  if (rss) {
    const channel = rss["channel"] as Record<string, unknown> | undefined;
    if (!channel) return { ok: false, error: "RSS feed has no <channel>" };
    const title = pickText(channel["title"]) ?? "";
    if (!title) return { ok: false, error: "RSS feed has no <title>" };
    const lang = pickText(channel["language"]) ?? null;
    const items = asArray(
      channel["item"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
    );
    return { ok: true, title, lang, item_count: items.length };
  }

  if (rdf) {
    // RDF 1.0: channel は rdf:RDF/channel
    const channel = rdf["channel"] as Record<string, unknown> | undefined;
    const title = pickText(channel?.["title"]) ?? "";
    if (!title) return { ok: false, error: "RDF feed has no <title>" };
    const lang = pickText(channel?.["language"]) ?? null;
    const items = asArray(
      rdf["item"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
    );
    return { ok: true, title, lang, item_count: items.length };
  }

  if (atomFeed) {
    const title = pickText(atomFeed["title"]) ?? "";
    if (!title) return { ok: false, error: "Atom feed has no <title>" };
    // Atom の言語は xml:lang 属性 (@_xml:lang) で表現されることが多い
    const lang =
      pickText(atomFeed["language"]) ?? (atomFeed["@_xml:lang"] as string | undefined) ?? null;
    const entries = asArray(
      atomFeed["entry"] as Record<string, unknown> | Record<string, unknown>[] | undefined,
    );
    return { ok: true, title, lang, item_count: entries.length };
  }

  return { ok: false, error: "not a valid RSS or Atom feed" };
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx]);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function collectAll(
  env: Env,
  opts?: { runId?: number; feedIds?: readonly string[]; source?: "cron" | "manual" },
): Promise<CollectAllResult> {
  const start = Date.now();
  const startedAt = new Date(start).toISOString();
  const feeds = loadEnabledFeeds();
  await syncFeeds(env.DB, feeds);

  // yaml の enabled=true を前提に、D1 で runtime disabled にされた feed を除外する。
  // feedIds が指定された場合はその ID に含まれるものだけを対象にする。
  // enabled 判定と conditional GET ヘッダ取得を 1 query に統合して subrequest を削減する。
  const { enabledIds: d1EnabledIds, headers: headersMap } = await loadEnabledFeedIdsAndHeaders(
    env.DB,
  );
  const activeFeeds = feeds.filter((f) => {
    if (!d1EnabledIds.has(f.id)) return false;
    if (opts?.feedIds !== undefined) return opts.feedIds.includes(f.id);
    return true;
  });

  const concurrency = Number(env.COLLECTOR_CONCURRENCY ?? "4") || 4;
  const timeoutMs = Number(env.COLLECTOR_TIMEOUT_MS ?? "10000") || 10000;
  // 0 (リトライ無効) を許容するため `|| 2` フォールバックは使わず NaN/負数のみデフォルトに落とす。
  const maxRetriesRaw = Number(env.COLLECTOR_RETRIES ?? "2");
  const maxRetries = Number.isFinite(maxRetriesRaw) && maxRetriesRaw >= 0 ? maxRetriesRaw : 2;
  const summaryMax = Number(env.SUMMARY_MAX_LENGTH ?? "500") || 500;

  const d1Acc = new D1CostAccumulator();

  // run_id が外から渡された場合はそれを使い、渡されなければここで startRun する
  let runId: number | null = opts?.runId ?? null;
  if (runId === null) {
    try {
      const { run_id, d1Meta } = await startRun(env.DB, startedAt, activeFeeds.length);
      runId = run_id;
      d1Acc.add(d1Meta);
    } catch (err) {
      console.error(
        `[collector] startRun failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const emptyHeaders: FeedHeaders = { last_etag: null, last_modified: null };

  // collectFeed が runId を受け取って per-feed batch に recordRunFeed を含めるため、
  // ここでは recordRunFeed を別途呼ばない (subrequest 削減)。
  const results = await runWithConcurrency(activeFeeds, concurrency, (feed) =>
    collectFeed(
      env,
      feed,
      headersMap.get(feed.id) ?? emptyHeaders,
      summaryMax,
      timeoutMs,
      maxRetries,
      runId,
      d1Acc,
    ),
  );

  const inserted = results.reduce((acc, r) => acc + r.inserted, 0);
  const skipped304 = results.filter((r) => r.status === "not_modified").length;
  const feedsOk = results.filter((r) => r.status === "ok" || r.status === "not_modified").length;
  const feedsFailed = results.filter((r) => r.status === "error").length;

  const durationMs = Date.now() - start;
  const completedAt = new Date(Date.now()).toISOString();

  // run の完了を記録する
  if (runId !== null) {
    try {
      const meta = await finishRun(env.DB, runId, completedAt, feedsOk, feedsFailed, inserted);
      d1Acc.add(meta);
    } catch (err) {
      console.error(
        `[collector] finishRun failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  const source = opts?.source ?? "cron";
  console.log(
    `[collector] source=${source} feeds=${activeFeeds.length} skipped304=${skipped304} inserted=${inserted} duration=${durationMs}ms`,
  );

  // D1 コスト集計を AE に送信する (best-effort)
  try {
    const d1Stats = d1Acc.toStats();
    writeD1CostEvent(env, {
      rowsRead: d1Stats.rowsRead,
      rowsWritten: d1Stats.rowsWritten,
      durationTotalMs: d1Stats.durationTotalMs,
      feedsCount: activeFeeds.length,
      articlesInserted: inserted,
    });
  } catch (err) {
    console.warn(
      `[collector] writeD1CostEvent failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  // feedId → url のマップを作り、失敗ログに URL と errorKind を含める。
  // wrangler tail で直接問題 URL を確認できるようにするため。
  const feedUrlMap = new Map(activeFeeds.map((f) => [f.id, f.url]));
  for (const r of results) {
    if (r.status === "error") {
      const url = feedUrlMap.get(r.feedId) ?? "(unknown)";
      console.warn(`[collector] ${r.feedId} ERROR kind=${r.errorKind} url=${url}: ${r.error}`);
    }
  }

  // ALERT_WEBHOOK_URL が未設定なら D1 クエリも含めて全スキップ
  if (env.ALERT_WEBHOOK_URL) {
    const minFailures = Number(env.ALERT_MIN_FAILURES ?? "3") || 3;
    const feedStreak = Number(env.ALERT_FEED_STREAK ?? "5") || 5;
    try {
      const streaks = await getFeedStreaks(env.DB);
      await maybeAlert(env.ALERT_WEBHOOK_URL, results, streaks, minFailures, feedStreak);
    } catch (err) {
      console.error(
        `[collector] alert check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // retention は scheduled() の pruneOldArticles に一本化しているため、ここでは常に 0
  const finalResult = { total: activeFeeds.length, inserted, pruned: 0, results, durationMs };

  // COLLECTOR_ALERT_WEBHOOK ベースのシンプルな閾値アラート (best-effort)
  try {
    await sendAlert(env, finalResult);
  } catch (err) {
    console.error(
      `[collector] sendAlert failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  return finalResult;
}

/**
 * 特定の feed_ids のみを対象に収集する。admin 手動トリガー用。
 * collectAll の薄いラッパー。run tracking (collector_runs) も有効。
 * - feedIds 未指定時は全 enabled feed を対象にする
 * - feedIds 指定時は enabled かつ指定 ID に含まれるものだけを対象にする
 */
export async function collectFeeds(env: Env, feedIds?: string[]): Promise<CollectAllResult> {
  return collectAll(env, { source: "manual", feedIds });
}
