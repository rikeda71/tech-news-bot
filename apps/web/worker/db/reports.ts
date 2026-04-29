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

// (kind, period_start, period_end, category, lang) で upsert する。
// UNIQUE index が COALESCE(category, '__all__') で張られているため、
// ON CONFLICT の target にも同じ式を指定する必要がある (SQLite 3.24+ の挙動)。
export async function upsertReport(db: D1Database, input: ReportInput): Promise<{ id: number }> {
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
