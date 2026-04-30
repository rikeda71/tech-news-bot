#!/usr/bin/env node
// production 既存の period-overlap レポートを 1 行にマージする one-shot スクリプト。
//
// Usage:
//   node tools/d1-client/merge-overlapping-reports.mjs --target=local|remote [--kind=<k1,k2,...>] [--apply]
//
// Default: dry-run (DB 変更なし)。--apply で実際に UPDATE / DELETE を実行する。
// --kind= 指定時は対象 kind に絞って overlap 検出 (例: --kind=weekly,monthly)。
// daily を含めると隣接日 (別日) の row が同一クラスタに巻き込まれることがあるため、
// weekly/monthly の重複統合には `--kind=weekly,monthly` のように絞ること。
//
// 出力 (stdout): JSON
//   {
//     target: "local" | "remote",
//     dry_run: boolean,
//     clusters: [{ keep_id, dropped_ids, period_start, period_end, kind, category, lang }],
//     total_dropped: number
//   }
//
// 注意: マージ時は各クラスタで最新 generated_at の row を keep とし、
//       drop 側の content / meta_json は失われる。
//       keep の period_start = MIN, period_end = MAX に拡張する。

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), "..", "..");
const WRANGLER_DIR = path.join(REPO_ROOT, "apps", "web");
const DB_NAME = "tech-news-bot-db";

// ---- CLI args ----

const VALID_KINDS = new Set(["daily", "weekly", "monthly"]);

/**
 * @typedef {"local" | "remote"} Target
 */

/**
 * @typedef {Object} ParsedArgs
 * @property {Target} target - D1 ターゲット
 * @property {boolean} apply - true の場合は実際に DB 変更を実行
 * @property {string[] | null} kinds - 対象 kind の配列。null は全 kind
 */

/**
 * @typedef {Object} ReportRow
 * @property {number} id
 * @property {string} kind
 * @property {string} period_start
 * @property {string} period_end
 * @property {string} cat - COALESCE(category, '__all__') の値
 * @property {string} lng - COALESCE(lang, '__all__') の値
 * @property {string | null} category
 * @property {string | null} lang
 * @property {string} generated_at
 */

/**
 * @typedef {Object} ClusterResult
 * @property {number} keep_id
 * @property {number[]} dropped_ids
 * @property {string} period_start
 * @property {string} period_end
 * @property {string} kind
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
  const out = { target: "local", apply: false, kinds: null };
  for (const arg of argv.slice(2)) {
    if (arg === "--apply") {
      out.apply = true;
      continue;
    }
    const m = arg.match(/^--([\w-]+)=(.+)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "target") out.target = /** @type {Target} */ (v);
    else if (k === "kind") {
      out.kinds = v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return out;
}

// ---- wrangler helper (inline from recent.mjs) ----

/**
 * wrangler d1 execute を実行して results 配列を返す。
 * @param {string} sql - 実行する SQL
 * @param {Target} target - D1 ターゲット
 * @returns {ReportRow[]}
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
  const start = stdout.indexOf("[");
  const end = stdout.lastIndexOf("]");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error(`wrangler stdout did not contain JSON array:\n${stdout}`);
  }
  /** @type {Array<{ results?: ReportRow[] }>} */
  const parsed = JSON.parse(stdout.slice(start, end + 1));
  return parsed[0]?.results ?? [];
}

// ---- overlap pair enumeration ----

const FETCH_ROWS_SQL = `
SELECT id, kind, period_start, period_end,
       COALESCE(category, '__all__') AS cat,
       COALESCE(lang, '__all__')     AS lng,
       category, lang, generated_at
FROM reports
ORDER BY kind, cat, lng, period_start;
`.trim();

/**
 * 半開区間 [a.period_start, a.period_end) と [b.period_start, b.period_end) が overlap するか判定。
 * 完全一致は UNIQUE 制約で重複しないはずだが、念のため除外しない (merge 対象にする)。
 * @param {ReportRow} a
 * @param {ReportRow} b
 * @returns {boolean}
 */
function overlaps(a, b) {
  return a.period_start < b.period_end && a.period_end > b.period_start;
}

/**
 * @typedef {Object} UnionFind
 * @property {(x: number) => number} find
 * @property {(x: number, y: number) => void} union
 */

/**
 * Union-Find データ構造を生成する。
 * @param {number} n - 要素数
 * @returns {UnionFind}
 */
function makeUF(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  /**
   * @param {number} x
   * @returns {number}
   */
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  /**
   * @param {number} x
   * @param {number} y
   * @returns {void}
   */
  function union(x, y) {
    parent[find(x)] = find(y);
  }
  return { find, union };
}

/**
 * 同 (kind, cat, lng) グループ内で overlap するペアを Union-Find でクラスタ化する。
 * @param {ReportRow[]} rows
 * @returns {ReportRow[][]} overlap するメンバーが 2 件以上のクラスタ配列
 */
function clusterRows(rows) {
  // グループ化
  /** @type {Map<string, ReportRow[]>} */
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.kind}|${row.cat}|${row.lng}`;
    if (!groups.has(key)) groups.set(key, []);
    /** @type {ReportRow[]} */ (groups.get(key)).push(row);
  }

  /** @type {ReportRow[][]} */
  const clusters = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const uf = makeUF(group.length);
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (overlaps(group[i], group[j])) {
          uf.union(i, j);
        }
      }
    }
    // クラスタごとに集約
    /** @type {Map<number, ReportRow[]>} */
    const clusterMap = new Map();
    for (let i = 0; i < group.length; i++) {
      const root = uf.find(i);
      if (!clusterMap.has(root)) clusterMap.set(root, []);
      /** @type {ReportRow[]} */ (clusterMap.get(root)).push(group[i]);
    }
    for (const members of clusterMap.values()) {
      if (members.length < 2) continue; // overlap なし
      clusters.push(members);
    }
  }
  return clusters;
}

// ---- main ----

function main() {
  const opts = parseArgs(process.argv);
  if (!["local", "remote"].includes(opts.target)) {
    process.stderr.write(`Invalid --target=${opts.target}. Use local or remote.\n`);
    process.exit(2);
  }
  if (opts.kinds) {
    if (opts.kinds.length === 0) {
      // `--kind=` や `--kind=,` のような空 csv は空配列になる。silent に全件 filter してしまうと
      // dry-run で 0 cluster 終了して merge 漏れに気付けないため fail-fast にする。
      process.stderr.write(
        `--kind= must contain at least one kind. Allowed: ${[...VALID_KINDS].join(",")}\n`,
      );
      process.exit(2);
    }
    const invalid = opts.kinds.filter((k) => !VALID_KINDS.has(k));
    if (invalid.length > 0) {
      process.stderr.write(
        `Invalid --kind value(s): ${invalid.join(",")}. Allowed: ${[...VALID_KINDS].join(",")}\n`,
      );
      process.exit(2);
    }
  }

  /** @type {ReportRow[]} */
  let rows;
  try {
    rows = execWrangler(FETCH_ROWS_SQL, opts.target);
  } catch (err) {
    process.stderr.write(
      `Failed to fetch rows: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }

  if (opts.kinds) {
    const allowed = new Set(opts.kinds);
    rows = rows.filter((r) => allowed.has(r.kind));
  }

  const clusters = clusterRows(rows);

  /** @type {{ target: Target; dry_run: boolean; clusters: ClusterResult[]; total_dropped: number }} */
  const output = {
    target: opts.target,
    dry_run: !opts.apply,
    clusters: [],
    total_dropped: 0,
  };

  for (const members of clusters) {
    // keep: 最新 generated_at
    members.sort((a, b) => (a.generated_at > b.generated_at ? -1 : 1));
    const keep = members[0];
    const drops = members.slice(1);

    const periodStart = members.reduce(
      (min, r) => (r.period_start < min ? r.period_start : min),
      keep.period_start,
    );
    const periodEnd = members.reduce(
      (max, r) => (r.period_end > max ? r.period_end : max),
      keep.period_end,
    );

    output.clusters.push({
      keep_id: keep.id,
      dropped_ids: drops.map((r) => r.id),
      period_start: periodStart,
      period_end: periodEnd,
      kind: keep.kind,
      category: keep.category ?? null,
      lang: keep.lang ?? null,
    });
    output.total_dropped += drops.length;

    if (opts.apply) {
      const dropIds = drops.map((r) => r.id).join(",");
      // UPDATE と DELETE を 1 回の `wrangler d1 execute --command` に渡してアトミックに実行する。
      // 別呼び出しに分けると UPDATE 成功・DELETE 失敗で keep の period が拡張済み + drop が残る
      // 中途半端な状態になり、再 POST で 409 が返り続ける詰みケースを生む。
      const mergeSQL =
        `UPDATE reports SET period_start = '${periodStart.replace(/'/g, "''")}', ` +
        `period_end = '${periodEnd.replace(/'/g, "''")}' ` +
        `WHERE id = ${keep.id}; ` +
        `DELETE FROM reports WHERE id IN (${dropIds});`;
      try {
        execWrangler(mergeSQL, opts.target);
      } catch (err) {
        process.stderr.write(
          `Failed to apply merge for keep_id=${keep.id}: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exit(1);
      }
    }
  }

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  process.exit(0);
}

main();
