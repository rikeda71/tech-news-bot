#!/usr/bin/env node
// D1 から最近の記事を抽出して JSON を stdout に出す。
// .claude/skills/tech-news-digest が呼ぶクライアント。
//
// Usage:
//   node tools/d1-client/recent.mjs --since=today [--target=local|remote]
//                                   [--category=ai|bigtech|jp|personal[,ai,...]] [--lang=ja|en]
//                                   [--limit=200]
//
// Output (stdout): JSON object as documented in SKILL.md
// Errors: human-readable text -> stderr, exit code 1
//
// 注意: --since の時刻計算は UTC 基準 (JST ではない)。
//   --since=today は「現在から 24 時間前」を意味する。
//   JST で「今日」の 0:00 起点が必要な場合は --since=1 (過去 1 日) も同義だが、
//   厳密に JST 起点にしたい場合は明示的な ISO 日時クエリが必要。

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..", "..");
const WRANGLER_DIR = path.join(REPO_ROOT, "apps", "web");
const DB_NAME = "tech-news-bot-db";

/**
 * @typedef {Object} ParsedArgs
 * @property {string | null} since - 期間指定 (today|week|month|<N>)
 * @property {"local" | "remote"} target - D1 ターゲット
 * @property {string | null} category - カテゴリフィルタ (カンマ区切り可)
 * @property {string | null} lang - 言語フィルタ (ja|en)
 * @property {number} limit - 取得上限件数
 */

/**
 * @typedef {Object} Article
 * @property {number} id
 * @property {string} guid
 * @property {number} feed_id
 * @property {string | null} feed_name
 * @property {string} title
 * @property {string} url
 * @property {string | null} summary
 * @property {string | null} author
 * @property {string} published_at
 * @property {string | null} category
 * @property {string | null} lang
 */

/**
 * コマンドライン引数をパースする。
 * @param {string[]} argv - process.argv
 * @returns {ParsedArgs}
 */
function parseArgs(argv) {
  /** @type {ParsedArgs} */
  const out = { since: null, target: "local", category: null, lang: null, limit: 200 };
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([\w-]+)=(.+)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "since") out.since = v;
    else if (k === "target") out.target = /** @type {"local" | "remote"} */ (v);
    else if (k === "category") out.category = v;
    else if (k === "lang") out.lang = v;
    else if (k === "limit") out.limit = Number.parseInt(v, 10) || 200;
  }
  return out;
}

/**
 * 期間指定文字列を ISO 8601 日時文字列に変換する。
 * @param {string} spec - today|week|this-week|month|this-month|<N>
 * @returns {string} ISO 8601 形式の日時文字列
 */
function sinceToISO(spec) {
  const now = new Date();
  let ms;
  if (spec === "today") ms = 24 * 3600 * 1000;
  else if (spec === "week" || spec === "this-week") ms = 7 * 24 * 3600 * 1000;
  else if (spec === "month" || spec === "this-month") ms = 30 * 24 * 3600 * 1000;
  else {
    const m = spec?.match?.(/^(\d+)$/);
    if (m) ms = Number(m[1]) * 24 * 3600 * 1000;
    else throw new Error(`Unsupported --since=${spec}. Use today|week|month|<N>`);
  }
  return new Date(now.getTime() - ms).toISOString();
}

const VALID_CATEGORIES = /** @type {readonly string[]} */ (["bigtech", "ai", "jp", "personal"]);
const VALID_LANGS = /** @type {readonly string[]} */ (["ja", "en"]);

/**
 * @typedef {Object} BuildSQLParams
 * @property {string} since - ISO 8601 日時文字列 (既変換済み)
 * @property {string | null} category - カテゴリフィルタ
 * @property {string | null} lang - 言語フィルタ
 * @property {number} limit - 取得上限
 */

/**
 * D1 クエリ SQL を構築する。
 * @param {BuildSQLParams} params
 * @returns {string}
 */
function buildSQL({ since, category, lang, limit }) {
  const where = [`a.published_at > '${since.replace(/'/g, "''")}'`];
  if (category) {
    const cats = category
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    const invalid = cats.filter((c) => !VALID_CATEGORIES.includes(c));
    if (invalid.length > 0) {
      process.stderr.write(
        `Invalid --category value(s): ${invalid.join(", ")}. Allowed: ${VALID_CATEGORIES.join(", ")}\n`,
      );
      process.exit(2);
    }
    const placeholders = cats.map((c) => `'${c.replace(/'/g, "''")}'`).join(", ");
    where.push(`a.category IN (${placeholders})`);
  }
  if (lang) {
    if (!VALID_LANGS.includes(lang)) {
      process.stderr.write(`Invalid --lang value: ${lang}. Allowed: ${VALID_LANGS.join(", ")}\n`);
      process.exit(2);
    }
    where.push(`a.lang = '${lang.replace(/'/g, "''")}'`);
  }
  return `
SELECT a.id, a.guid, a.feed_id, f.name AS feed_name,
       a.title, a.url, a.summary, a.author,
       a.published_at, a.category, a.lang
FROM articles a
LEFT JOIN feeds f ON f.id = a.feed_id
WHERE ${where.join(" AND ")}
ORDER BY a.published_at DESC
LIMIT ${Math.max(1, Math.min(limit, 1000))};
  `.trim();
}

/**
 * wrangler d1 execute を実行して results 配列を返す。
 * @param {string} sql - 実行する SQL
 * @param {"local" | "remote"} target - D1 ターゲット
 * @returns {Article[]}
 */
function execWrangler(sql, target) {
  const args = [
    "exec",
    "wrangler",
    "d1",
    "execute",
    DB_NAME,
    target === "remote" ? "--remote" : "--local",
    "--json",
    "--command",
    sql,
  ];
  const result = spawnSync("pnpm", args, { cwd: WRANGLER_DIR, encoding: "utf8" });
  if (result.status !== 0) {
    const msg = (result.stderr || result.stdout || "").trim();
    throw new Error(`wrangler d1 execute failed (exit ${result.status}):\n${msg}`);
  }
  const stdout = result.stdout.trim();
  // wrangler は前後にバナーを出すことがあるので JSON 部分のみ抜き出す
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`wrangler stdout did not contain JSON array:\n${stdout}`);
  }
  /** @type {Array<{ results?: Article[] }>} */
  const parsed = JSON.parse(stdout.slice(start, end + 1));
  // wrangler --json: [{ results: [...], success: true, meta: {...} }]
  return parsed[0]?.results ?? [];
}

/**
 * 記事配列を指定キーで集計して Record を返す。
 * @param {Article[]} articles
 * @param {keyof Article} key
 * @returns {Record<string, number>}
 */
function aggregate(articles, key) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const a of articles) {
    const k = String(a[key] ?? "unknown");
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

function main() {
  const opts = parseArgs(process.argv);
  if (!opts.since) {
    process.stderr.write("Missing --since=today|week|month|<N>\n");
    process.exit(2);
  }
  const sinceISO = sinceToISO(opts.since);
  const sql = buildSQL({ ...opts, since: sinceISO });
  /** @type {Article[]} */
  let articles;
  try {
    articles = execWrangler(sql, opts.target);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
  // URL による de-dup: 同一記事が複数フィード間で重複することがあるため、
  // 最も古い published_at のものを 1 件だけ残す。
  const sorted = articles.toSorted((a, b) => a.published_at.localeCompare(b.published_at));
  const seen = new Set();
  /** @type {Article[]} */
  const deduped = [];
  for (const a of sorted) {
    if (!seen.has(a.url)) {
      seen.add(a.url);
      deduped.push(a);
    }
  }
  // 出力は新しい順に戻す
  const dedupedSorted = deduped.toSorted((a, b) => b.published_at.localeCompare(a.published_at));

  const result = {
    since: sinceISO,
    target: opts.target,
    filters: {
      category: opts.category ?? null,
      lang: opts.lang ?? null,
    },
    total: articles.length,
    deduped_total: dedupedSorted.length,
    articles: dedupedSorted,
    by_category: aggregate(dedupedSorted, "category"),
    by_feed: aggregate(dedupedSorted, "feed_id"),
    by_lang: aggregate(dedupedSorted, "lang"),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
