#!/usr/bin/env node
// D1 の reports テーブルを操作する CLI。
// .claude/skills/tech-news-reports が呼ぶクライアント。
//
// Usage:
//   node tools/d1-client/reports.mjs list [--kind=daily|weekly|monthly] [--from=<ISO>] [--to=<ISO>] [--limit=N] [--target=local|remote]
//   node tools/d1-client/reports.mjs show <id> [--target=local|remote]
//   node tools/d1-client/reports.mjs delete <id|id1,id2,...> [--target=local|remote] [--apply]
//   node tools/d1-client/reports.mjs find-overlaps [--kind=daily|weekly|monthly] [--target=local|remote]
//
// Output (stdout): JSON object
// Errors: human-readable text -> stderr, exit code 1

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..", "..");
const WRANGLER_DIR = path.join(REPO_ROOT, "apps", "web");
const DB_NAME = "tech-news-bot-db";

/** @type {readonly string[]} */
const VALID_KINDS = ["daily", "weekly", "monthly"];
/** @type {readonly string[]} */
const VALID_TARGETS = ["local", "remote"];
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;
const POS_INT_RE = /^\d+$/;

/**
 * @typedef {"daily" | "weekly" | "monthly"} ReportKind
 * @typedef {"local" | "remote"} Target
 */

/**
 * @typedef {Object} ReportRow
 * @property {number} id
 * @property {ReportKind} kind
 * @property {string} period_start
 * @property {string} period_end
 * @property {string | null} category
 * @property {string | null} lang
 * @property {string | null} source_skill
 * @property {string} generated_at
 * @property {number} [content_len]
 * @property {string} [content]
 * @property {string | null} [meta_json]
 */

/**
 * @typedef {Object} ParsedOpts
 * @property {string | null} kind
 * @property {string | null} from
 * @property {string | null} to
 * @property {number} limit
 * @property {Target} target
 * @property {boolean} apply
 */

/**
 * @typedef {Object} ParsedArgs
 * @property {string[]} positional
 * @property {ParsedOpts} opts
 */

// SQL リテラルへ文字列を埋め込む際の escape。validate* と二重防御。
// 値は事前に allowlist / regex で検証済みなので通常はシングルクォート escape で十分。
/**
 * SQL シングルクォート文字列として安全にエスケープする。
 * @param {string} s
 * @returns {string}
 */
function sqlQuote(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * コマンドライン引数をパースする。
 * @param {string[]} argv - process.argv
 * @returns {ParsedArgs}
 */
function parseArgs(argv) {
  const positional = /** @type {string[]} */ ([]);
  /** @type {ParsedOpts} */
  const opts = {
    kind: null,
    from: null,
    to: null,
    limit: 50,
    target: "local",
    apply: false,
  };
  for (const arg of argv.slice(2)) {
    if (arg === "--apply") {
      opts.apply = true;
      continue;
    }
    const m = arg.match(/^--([\w-]+)=(.+)$/);
    if (m) {
      const [, k, v] = m;
      if (k === "kind") opts.kind = v;
      else if (k === "from") opts.from = v;
      else if (k === "to") opts.to = v;
      else if (k === "limit") opts.limit = Number.parseInt(v, 10) || 50;
      else if (k === "target") opts.target = /** @type {Target} */ (v);
    } else {
      positional.push(arg);
    }
  }
  return { positional, opts };
}

/**
 * wrangler d1 execute を実行して results 配列を返す。
 * @template {object} T
 * @param {string} sql - 実行する SQL
 * @param {Target} target - D1 ターゲット
 * @returns {T[]}
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
  /** @type {Array<{ results?: T[] }>} */
  const parsed = JSON.parse(stdout.slice(start, end + 1));
  // wrangler --json: [{ results: [...], success: true, meta: {...} }]
  return parsed[0]?.results ?? [];
}

/**
 * kind の値が有効か検証する。無効なら stderr に書いて exit(2)。
 * @param {string | null} kind
 * @returns {void}
 */
function validateKind(kind) {
  if (kind !== null && !VALID_KINDS.includes(kind)) {
    process.stderr.write(`Invalid --kind value: ${kind}. Allowed: ${VALID_KINDS.join(", ")}\n`);
    process.exit(2);
  }
}

/**
 * target の値が有効か検証する。無効なら stderr に書いて exit(2)。
 * @param {string} target
 * @returns {void}
 */
function validateTarget(target) {
  if (!VALID_TARGETS.includes(target)) {
    process.stderr.write(
      `Invalid --target value: ${target}. Allowed: ${VALID_TARGETS.join(", ")}\n`,
    );
    process.exit(2);
  }
}

/**
 * ISO 8601 日時文字列として有効か検証する。無効なら stderr に書いて exit(2)。
 * @param {string | null} value
 * @param {string} name - フラグ名 (エラーメッセージ用)
 * @returns {void}
 */
function validateIso(value, name) {
  if (value !== null && !ISO_RE.test(value)) {
    process.stderr.write(
      `Invalid ${name} value: ${value}. Must match ISO 8601 datetime (e.g. 2026-01-01T00:00:00Z)\n`,
    );
    process.exit(2);
  }
}

/**
 * カンマ区切りの ID 文字列を正の整数配列に変換する。無効なら stderr に書いて exit(2)。
 * @param {string} rawIds - カンマ区切りの ID 文字列
 * @returns {number[]}
 */
function validateIds(rawIds) {
  const tokens = rawIds
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  // `parseInt("3abc", 10)` は 3 を返してしまうので、先に厳密な数字フォーマットを要求する。
  if (tokens.some((t) => !POS_INT_RE.test(t))) {
    process.stderr.write(`Invalid id(s): ${rawIds}. Must be positive integer(s).\n`);
    process.exit(2);
  }
  const ids = tokens.map((t) => Number.parseInt(t, 10));
  if (ids.some((id) => !Number.isFinite(id) || id <= 0)) {
    process.stderr.write(`Invalid id(s): ${rawIds}. Must be positive integer(s).\n`);
    process.exit(2);
  }
  return ids;
}

/**
 * list サブコマンドを実行する。
 * @param {ParsedOpts} opts
 * @returns {void}
 */
function cmdList(opts) {
  validateKind(opts.kind);
  validateTarget(opts.target);
  validateIso(opts.from, "--from");
  validateIso(opts.to, "--to");

  const limit = Math.max(1, Math.min(opts.limit, 1000));
  const where = ["1=1"];
  // sqlQuote で escape する (validate を通っていても二重防御)。
  if (opts.kind) where.push(`kind = ${sqlQuote(opts.kind)}`);
  if (opts.from) where.push(`generated_at >= ${sqlQuote(opts.from)}`);
  if (opts.to) where.push(`generated_at <= ${sqlQuote(opts.to)}`);

  const sql = `SELECT id, kind, period_start, period_end, category, lang, source_skill, generated_at, length(content) AS content_len FROM reports WHERE ${where.join(" AND ")} ORDER BY generated_at DESC LIMIT ${limit};`;

  /** @type {ReportRow[]} */
  let reports;
  try {
    reports = execWrangler(sql, opts.target);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  const result = {
    target: opts.target,
    filters: {
      kind: opts.kind ?? null,
      from: opts.from ?? null,
      to: opts.to ?? null,
    },
    total: reports.length,
    reports,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

/**
 * show サブコマンドを実行する。
 * @param {number} id - レポート ID
 * @param {ParsedOpts} opts
 * @returns {void}
 */
function cmdShow(id, opts) {
  validateTarget(opts.target);
  const sql = `SELECT id, kind, period_start, period_end, category, lang, content, meta_json, source_skill, generated_at FROM reports WHERE id = ${id};`;

  /** @type {ReportRow[]} */
  let rows;
  try {
    rows = execWrangler(sql, opts.target);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  if (rows.length === 0) {
    process.stderr.write(`Report id=${id} not found.\n`);
    process.exit(1);
  }

  const result = {
    target: opts.target,
    report: rows[0],
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

/**
 * delete サブコマンドを実行する。
 * @param {number[]} ids - 削除対象の ID 配列
 * @param {ParsedOpts} opts
 * @returns {void}
 */
function cmdDelete(ids, opts) {
  validateTarget(opts.target);
  const idList = ids.join(", ");

  // dry-run: SELECT して対象行を確認
  const selectSql = `SELECT id, kind, period_start, period_end, category, lang, source_skill, generated_at FROM reports WHERE id IN (${idList});`;

  /** @type {ReportRow[]} */
  let found;
  try {
    found = execWrangler(selectSql, opts.target);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  const foundIds = found.map((r) => r.id);

  if (!opts.apply) {
    // dry-run
    const result = {
      target: opts.target,
      dry_run: true,
      requested_ids: ids,
      found_ids: foundIds,
      deleted_count: 0,
      found_reports: found,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  // --apply: 実際に DELETE
  if (foundIds.length === 0) {
    const result = {
      target: opts.target,
      dry_run: false,
      requested_ids: ids,
      found_ids: [],
      deleted_count: 0,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const deleteSql = `DELETE FROM reports WHERE id IN (${foundIds.join(", ")});`;
  try {
    execWrangler(deleteSql, opts.target);
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  const result = {
    target: opts.target,
    dry_run: false,
    requested_ids: ids,
    found_ids: foundIds,
    deleted_count: foundIds.length,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

/**
 * @typedef {Object} OverlapRow
 * @property {number} a_id
 * @property {ReportKind} a_kind
 * @property {string} a_period_start
 * @property {string} a_period_end
 * @property {string | null} a_category
 * @property {string | null} a_lang
 * @property {string | null} a_source_skill
 * @property {string} a_generated_at
 * @property {number} b_id
 * @property {ReportKind} b_kind
 * @property {string} b_period_start
 * @property {string} b_period_end
 * @property {string | null} b_category
 * @property {string | null} b_lang
 * @property {string | null} b_source_skill
 * @property {string} b_generated_at
 */

/**
 * find-overlaps サブコマンドを実行する。
 * @param {ParsedOpts} opts
 * @returns {void}
 */
function cmdFindOverlaps(opts) {
  validateKind(opts.kind);
  validateTarget(opts.target);

  const kindClause = opts.kind ? `AND a.kind = ${sqlQuote(opts.kind)}` : "";

  const sql = `
SELECT
  a.id        AS a_id,
  a.kind      AS a_kind,
  a.period_start AS a_period_start,
  a.period_end   AS a_period_end,
  a.category  AS a_category,
  a.lang      AS a_lang,
  a.source_skill AS a_source_skill,
  a.generated_at AS a_generated_at,
  b.id        AS b_id,
  b.kind      AS b_kind,
  b.period_start AS b_period_start,
  b.period_end   AS b_period_end,
  b.category  AS b_category,
  b.lang      AS b_lang,
  b.source_skill AS b_source_skill,
  b.generated_at AS b_generated_at
FROM reports a
JOIN reports b
  ON a.kind = b.kind
  AND COALESCE(a.category, '__all__') = COALESCE(b.category, '__all__')
  AND COALESCE(a.lang, '__all__') = COALESCE(b.lang, '__all__')
  AND a.period_start < b.period_end
  AND a.period_end > b.period_start
  AND a.id < b.id
${kindClause}
ORDER BY a.kind, a.period_start, a.id, b.id;
  `.trim();

  /** @type {OverlapRow[]} */
  let rows;
  try {
    rows = /** @type {OverlapRow[]} */ (execWrangler(sql, opts.target));
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  const overlaps = rows.map((row) => ({
    a: {
      id: row.a_id,
      kind: row.a_kind,
      period_start: row.a_period_start,
      period_end: row.a_period_end,
      category: row.a_category,
      lang: row.a_lang,
      source_skill: row.a_source_skill,
      generated_at: row.a_generated_at,
    },
    b: {
      id: row.b_id,
      kind: row.b_kind,
      period_start: row.b_period_start,
      period_end: row.b_period_end,
      category: row.b_category,
      lang: row.b_lang,
      source_skill: row.b_source_skill,
      generated_at: row.b_generated_at,
    },
  }));

  const result = {
    target: opts.target,
    total_pairs: overlaps.length,
    overlaps,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function main() {
  const { positional, opts } = parseArgs(process.argv);
  const subcommand = positional[0];

  if (!subcommand) {
    process.stderr.write("Usage: reports.mjs <list|show|delete|find-overlaps> [options]\n");
    process.exit(2);
  }

  switch (subcommand) {
    case "list":
      cmdList(opts);
      break;
    case "show": {
      const rawId = positional[1];
      if (!rawId) {
        process.stderr.write("Usage: reports.mjs show <id> [--target=local|remote]\n");
        process.exit(2);
      }
      const ids = validateIds(rawId);
      if (ids.length !== 1) {
        process.stderr.write("show requires exactly one id.\n");
        process.exit(2);
      }
      cmdShow(ids[0], opts);
      break;
    }
    case "delete": {
      const rawIds = positional[1];
      if (!rawIds) {
        process.stderr.write(
          "Usage: reports.mjs delete <id|id1,id2,...> [--target=local|remote] [--apply]\n",
        );
        process.exit(2);
      }
      const ids = validateIds(rawIds);
      cmdDelete(ids, opts);
      break;
    }
    case "find-overlaps":
      cmdFindOverlaps(opts);
      break;
    default:
      process.stderr.write(
        `Unknown subcommand: ${subcommand}. Use list|show|delete|find-overlaps\n`,
      );
      process.exit(2);
  }
}

main();
