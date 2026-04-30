#!/usr/bin/env node
// production 既存の period-overlap レポートを 1 行にマージする one-shot スクリプト。
//
// Usage:
//   node tools/d1-client/merge-overlapping-reports.mjs --target=local|remote [--apply]
//
// Default: dry-run (DB 変更なし)。--apply で実際に UPDATE / DELETE を実行する。
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

function parseArgs(argv) {
  const out = { target: "local", apply: false };
  for (const arg of argv.slice(2)) {
    if (arg === "--apply") {
      out.apply = true;
      continue;
    }
    const m = arg.match(/^--([\w-]+)=(.+)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (k === "target") out.target = v;
  }
  return out;
}

// ---- wrangler helper (inline from recent.mjs) ----

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

// 半開区間 [a_start, a_end) と [b_start, b_end) が overlap するか判定
// 完全一致は UNIQUE 制約で重複しないはずだが、念のため除外しない (merge 対象にする)。
function overlaps(a, b) {
  return a.period_start < b.period_end && a.period_end > b.period_start;
}

// Union-Find
function makeUF(n) {
  const parent = Array.from({ length: n }, (_, i) => i);
  function find(x) {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  }
  function union(x, y) {
    parent[find(x)] = find(y);
  }
  return { find, union };
}

// 同 (kind, cat, lng) グループ内で overlap するペアを Union-Find でクラスタ化
function clusterRows(rows) {
  // グループ化
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.kind}|${row.cat}|${row.lng}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

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
    const clusterMap = new Map();
    for (let i = 0; i < group.length; i++) {
      const root = uf.find(i);
      if (!clusterMap.has(root)) clusterMap.set(root, []);
      clusterMap.get(root).push(group[i]);
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

  let rows;
  try {
    rows = execWrangler(FETCH_ROWS_SQL, opts.target);
  } catch (err) {
    process.stderr.write(`Failed to fetch rows: ${err.message}\n`);
    process.exit(1);
  }

  const clusters = clusterRows(rows);

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
      const updateSQL =
        `UPDATE reports SET period_start = '${periodStart.replace(/'/g, "''")}', ` +
        `period_end = '${periodEnd.replace(/'/g, "''")}' ` +
        `WHERE id = ${keep.id};`;
      const deleteSQL = `DELETE FROM reports WHERE id IN (${dropIds});`;
      try {
        execWrangler(updateSQL, opts.target);
        execWrangler(deleteSQL, opts.target);
      } catch (err) {
        process.stderr.write(`Failed to apply merge for keep_id=${keep.id}: ${err.message}\n`);
        process.exit(1);
      }
    }
  }

  process.stdout.write(JSON.stringify(output, null, 2) + "\n");
  process.exit(0);
}

main();
