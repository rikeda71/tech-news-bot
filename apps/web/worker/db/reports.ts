// reports テーブルへのアクセス層。GitHub Actions から定期投入される
// 自動生成レポート (markdown) の upsert / list / get を提供する。

export type ReportKind = "daily" | "weekly" | "monthly";

export interface ReportInput {
  kind: ReportKind;
  period_start: string;
  period_end: string;
  category: string | null;
  lang: string | null;
  content: string;
  meta_json: string | null;
  source_skill: string;
  generated_at: string;
}

export interface ReportRow {
  id: number;
  kind: ReportKind;
  period_start: string;
  period_end: string;
  category: string | null;
  lang: string | null;
  source_skill: string;
  generated_at: string;
}

export interface ReportDetailRow extends ReportRow {
  content: string;
  meta_json: string | null;
}

const ALL_SENTINEL = "__all__";

// 半開区間 [period_start, period_end) が既存 row と overlap する row を返す。
// 完全一致 (period_start == new.period_start AND period_end == new.period_end) は
// 既存の UNIQUE 制約 + ON CONFLICT UPDATE で処理されるため overlap 扱いしない。
// 同 kind / 同 COALESCE(category, '__all__') / 同 COALESCE(lang, '__all__') のみ対象。
export async function findOverlappingReports(
  db: D1Database,
  input: Pick<ReportInput, "kind" | "period_start" | "period_end" | "category" | "lang">,
): Promise<ReportRow[]> {
  // bind 順: ?1=kind, ?2=category, ?3=lang, ?4=input.period_start, ?5=input.period_end
  // half-open overlap 条件 (existing.start < input.end AND existing.end > input.start) を
  // ?4/?5 経由で表現する。`existing.period_end > ?4` の `?4` は input.period_start を指す
  // (column 名と placeholder 番号が一致しないため、bind 順を変更しないこと)。
  const result = await db
    .prepare(
      `SELECT id, kind, period_start, period_end, category, lang, source_skill, generated_at
       FROM reports
       WHERE kind = ?1
         AND COALESCE(category, '${ALL_SENTINEL}') = COALESCE(?2, '${ALL_SENTINEL}')
         AND COALESCE(lang,     '${ALL_SENTINEL}') = COALESCE(?3, '${ALL_SENTINEL}')
         AND period_start < ?5  -- existing.period_start < input.period_end
         AND period_end   > ?4  -- existing.period_end   > input.period_start
         AND NOT (period_start = ?4 AND period_end = ?5)  -- 完全一致は ON CONFLICT で処理`,
    )
    .bind(input.kind, input.category, input.lang, input.period_start, input.period_end)
    .all<ReportRow>();
  return result.results ?? [];
}

// overlap した既存レポートが存在するときに upsertReport が throw するエラー。
export class OverlapError extends Error {
  public readonly conflictingIds: number[];
  constructor(conflictingIds: number[]) {
    super(`report period overlaps with existing report(s): ids=[${conflictingIds.join(",")}]`);
    this.name = "OverlapError";
    this.conflictingIds = conflictingIds;
  }
}

// (kind, period_start, period_end, category, lang) で upsert する。
// UNIQUE index が COALESCE(category, '__all__') で張られているため、
// ON CONFLICT の target にも同じ式を指定する必要がある (SQLite 3.24+ の挙動)。
// 半開区間 overlap が検出された場合は OverlapError を throw する。
export async function upsertReport(db: D1Database, input: ReportInput): Promise<{ id: number }> {
  const overlapping = await findOverlappingReports(db, input);
  if (overlapping.length > 0) {
    throw new OverlapError(overlapping.map((r) => r.id));
  }

  const result = await db
    .prepare(
      `INSERT INTO reports
         (kind, period_start, period_end, category, lang,
          content, meta_json, source_skill, generated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
       ON CONFLICT (
         kind, period_start, period_end,
         COALESCE(category, '${ALL_SENTINEL}'),
         COALESCE(lang, '${ALL_SENTINEL}')
       )
       DO UPDATE SET
         content      = excluded.content,
         meta_json    = excluded.meta_json,
         source_skill = excluded.source_skill,
         generated_at = excluded.generated_at
       RETURNING id`,
    )
    .bind(
      input.kind,
      input.period_start,
      input.period_end,
      input.category,
      input.lang,
      input.content,
      input.meta_json,
      input.source_skill,
      input.generated_at,
    )
    .first<{ id: number }>();
  if (!result) {
    throw new Error("upsertReport returned no row");
  }
  return { id: result.id };
}

export async function listReports(
  db: D1Database,
  filter: {
    kind?: ReportKind;
    limit: number;
  },
): Promise<ReportRow[]> {
  const limit = Math.max(1, Math.min(filter.limit, 100));
  let query = `SELECT id, kind, period_start, period_end, category, lang,
                      source_skill, generated_at
               FROM reports`;
  const binds: unknown[] = [];
  if (filter.kind) {
    query += ` WHERE kind = ?1`;
    binds.push(filter.kind);
  }
  query += ` ORDER BY generated_at DESC LIMIT ${limit}`;
  const stmt = binds.length > 0 ? db.prepare(query).bind(...binds) : db.prepare(query);
  const result = await stmt.all<ReportRow>();
  return result.results ?? [];
}

export async function getReport(db: D1Database, id: number): Promise<ReportDetailRow | null> {
  const row = await db
    .prepare(
      `SELECT id, kind, period_start, period_end, category, lang,
              content, meta_json, source_skill, generated_at
       FROM reports WHERE id = ?1`,
    )
    .bind(id)
    .first<ReportDetailRow>();
  return row ?? null;
}
