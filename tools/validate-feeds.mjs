#!/usr/bin/env node
// feeds.yaml に登録された URL の到達性を検証するスクリプト。
// enabled: true のフィードに HEAD (必要なら GET フォールバック) を送り、
// 200 OK + 妥当な Content-Type を確認する。
//
// Usage:
//   node tools/validate-feeds.mjs
//
// Exit code 0: 全件 OK、1: 1 件以上失敗

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..");
const FEEDS_YAML = path.join(REPO_ROOT, "apps", "web", "worker", "feeds.yaml");

/** 許容する Content-Type (プレフィックス一致) */
const VALID_CONTENT_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "text/xml",
  "application/xml",
  "application/feed+json",
];

/**
 * raw.githubusercontent.com など text/plain を返すが実体は XML のホストに対し、
 * GET でボディ先頭を確認して RSS/Atom XML かどうか判定する。
 */
const XML_BODY_PATTERN = /^\s*<\?xml/;

// Worker の fetchFeed と同じ UA を使い、bot ブロックの差異を排除する
const USER_AGENT = "tech-news-bot/1.0 (https://github.com/rikeda71/tech-news-bot)";
const TIMEOUT_MS = 10_000;
const CONCURRENCY = 4;

/**
 * feeds.yaml を最低限パースして { feeds: FeedEntry[] } を返す。
 * yaml パッケージを使わず Node.js 組み込みのみで実装する。
 * feeds.yaml はフラットなリスト構造のため、正規表現で十分。
 */
function parseFeeds(yamlText) {
  const feeds = [];
  // 各フィードエントリを "-" で始まるブロックに分割
  const blocks = yamlText.split(/\n(?=  - )/);
  for (const block of blocks) {
    // "  - id: xxx" で始まるブロックのみ処理
    if (!/^\s*- /.test(block)) continue;
    const get = (key) => {
      const m = block.match(new RegExp(`\\b${key}:\\s*(.+)`));
      return m ? m[1].trim() : null;
    };
    const id = get("id");
    const url = get("url");
    const enabledRaw = get("enabled");
    // "enabled: false" の場合のみ skip (デフォルト true)
    if (!id || !url) continue;
    feeds.push({ id, url, enabled: enabledRaw !== "false" });
  }
  return feeds;
}

function isValidContentType(ct) {
  if (!ct) return false;
  // Content-Type は "text/xml; charset=utf-8" のような形式
  const base = ct.split(";")[0].trim().toLowerCase();
  return VALID_CONTENT_TYPES.some((v) => base === v);
}

/**
 * @param {string} url
 * @param {"HEAD"|"GET"} method
 * @returns {Promise<{status: number, contentType: string|null, body: string|null, error: string|null}>}
 */
async function fetchCheck(url, method) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT },
    });
    const contentType = res.headers.get("content-type");
    // GET の場合、Content-Type 検証用にボディ先頭を読む
    let body = null;
    if (method === "GET") {
      const text = await res.text();
      body = text.slice(0, 200);
    }
    return { status: res.status, contentType, body, error: null };
  } catch (err) {
    const msg = err.name === "AbortError" ? "timeout" : String(err.message ?? err);
    return { status: 0, contentType: null, body: null, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * HEAD を試みて 4xx またはネットワークエラーならば GET にフォールバックする。
 * Content-Type が text/plain でも GET ボディが XML なら valid とみなす
 * (raw.githubusercontent.com 等の静的ファイルホストへの対応)。
 * @param {string} url
 */
async function checkUrl(url) {
  const head = await fetchCheck(url, "HEAD");
  // HEAD が 4xx (405 Method Not Allowed 等) またはネットワークエラーの場合 GET で再試行
  if (head.status >= 400 || head.error) {
    const get = await fetchCheck(url, "GET");
    const { contentType, bodyDetected } = resolveContentType(get.contentType, get.body);
    return { method: "GET (fallback)", ...get, contentType, bodyDetected };
  }
  // HEAD 成功でも Content-Type が不正の場合は GET でボディを確認
  if (!isValidContentType(head.contentType)) {
    const get = await fetchCheck(url, "GET");
    const { contentType, bodyDetected } = resolveContentType(get.contentType, get.body);
    return { method: "GET (ct-check)", ...get, contentType, bodyDetected };
  }
  return { method: "HEAD", ...head, bodyDetected: false };
}

/**
 * Content-Type が text/plain でもボディが XML なら application/xml として扱う。
 * @param {string|null} ct
 * @param {string|null} body
 * @returns {{ contentType: string|null, bodyDetected: boolean }}
 */
function resolveContentType(ct, body) {
  if (!isValidContentType(ct) && body && XML_BODY_PATTERN.test(body)) {
    return { contentType: "application/xml", bodyDetected: true };
  }
  return { contentType: ct, bodyDetected: false };
}

/** 並列度 n でタスクを実行する */
async function pooled(tasks, concurrency) {
  const results = Array.from({ length: tasks.length });
  let idx = 0;
  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

function pad(str, len) {
  return String(str).padEnd(len);
}

async function main() {
  const raw = readFileSync(FEEDS_YAML, "utf8");
  const feeds = parseFeeds(raw).filter((f) => f.enabled);

  if (feeds.length === 0) {
    console.log("No enabled feeds found.");
    process.exit(0);
  }

  console.log(
    `Checking ${feeds.length} feeds (concurrency=${CONCURRENCY}, timeout=${TIMEOUT_MS}ms)...\n`,
  );

  const tasks = feeds.map((feed) => () => checkUrl(feed.url).then((r) => ({ feed, ...r })));
  const results = await pooled(tasks, CONCURRENCY);

  const failures = [];

  // 表ヘッダ
  const COL = { id: 32, status: 8, ct: 34, method: 16, note: 0 };
  const header = [
    pad("ID", COL.id),
    pad("STATUS", COL.status),
    pad("CONTENT-TYPE", COL.ct),
    pad("METHOD", COL.method),
    "NOTE",
  ].join(" | ");
  const divider = "-".repeat(header.length);
  console.log(header);
  console.log(divider);

  for (const r of results) {
    const ok2xx = r.status >= 200 && r.status < 300;
    const ctOk = isValidContentType(r.contentType) || r.bodyDetected;
    const pass = ok2xx && ctOk && !r.error;

    const note = r.error
      ? `ERROR: ${r.error}`
      : !ok2xx
        ? `non-2xx`
        : !ctOk
          ? `invalid Content-Type`
          : r.bodyDetected
            ? "OK (xml body-detected)"
            : "OK";

    const line = [
      pad(r.feed.id, COL.id),
      pad(r.status || "-", COL.status),
      pad(r.contentType ?? "-", COL.ct),
      pad(r.method, COL.method),
      note,
    ].join(" | ");
    console.log(line);

    if (!pass) failures.push({ id: r.feed.id, url: r.feed.url, note });
  }

  console.log(divider);

  if (failures.length > 0) {
    console.log(`\n${failures.length} feed(s) failed:\n`);
    for (const f of failures) {
      console.log(`  - ${f.id}: ${f.note}`);
      console.log(`    ${f.url}`);
    }
    process.exit(1);
  }

  console.log(`\nAll ${feeds.length} feeds passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
