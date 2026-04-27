#!/usr/bin/env node
// D1 から最近の記事を抽出して JSON を stdout に出す。
// .claude/skills/tech-news-digest が呼ぶクライアント。
//
// Usage:
//   node tools/d1-client/recent.mjs --since=today [--target=local|remote]
//                                   [--category=ai|bigtech|jp|zenn] [--lang=ja|en]
//                                   [--limit=200]
//
// Output (stdout): JSON object as documented in SKILL.md
// Errors: human-readable text -> stderr, exit code 1

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..", "..");
const WRANGLER_DIR = path.join(REPO_ROOT, "apps", "web");
const DB_NAME = "tech-news-bot-db";

function parseArgs(argv) {
  const out = { since: null, target: "local", category: null, lang: null, limit: 200 };
  for (const arg of argv.slice(2)) {
    const m = arg.match(/^--([\w-]+)=(.+)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "since") out.since = v;
    else if (k === "target") out.target = v;
    else if (k === "category") out.category = v;
    else if (k === "lang") out.lang = v;
    else if (k === "limit") out.limit = Number.parseInt(v, 10) || 200;
  }
  return out;
}

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

function buildSQL({ since, category, lang, limit }) {
  const where = [`a.published_at > '${since.replace(/'/g, "''")}'`];
  if (category) where.push(`a.category = '${category.replace(/'/g, "''")}'`);
  if (lang) where.push(`a.lang = '${lang.replace(/'/g, "''")}'`);
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
  const parsed = JSON.parse(stdout.slice(start, end + 1));
  // wrangler --json: [{ results: [...], success: true, meta: {...} }]
  return parsed[0]?.results ?? [];
}

function aggregate(articles, key) {
  const out = {};
  for (const a of articles) {
    const k = a[key] ?? "unknown";
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
  let articles;
  try {
    articles = execWrangler(sql, opts.target);
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
  const result = {
    since: sinceISO,
    target: opts.target,
    filters: {
      category: opts.category ?? null,
      lang: opts.lang ?? null,
    },
    total: articles.length,
    articles,
    by_category: aggregate(articles, "category"),
    by_feed: aggregate(articles, "feed_id"),
    by_lang: aggregate(articles, "lang"),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main();
