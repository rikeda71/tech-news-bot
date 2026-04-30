export async function pruneOldArticles(db: D1Database, days: number): Promise<{ deleted: number }> {
  // days が 0 / 負数 / 非有限のときは no-op
  if (!Number.isFinite(days) || days <= 0) return { deleted: 0 };

  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  // articles_ad トリガが DELETE に連動して articles_fts を更新するため、
  // DELETE 後の meta.changes にはトリガ由来の変更数が混入し実際の削除件数を正確に返せない。
  // そのため先に COUNT(*) で削除予定件数を取得し、DELETE 後の meta.changes は使わない。
  // Cron は単一インスタンスで動作するため、COUNT と DELETE の間に競合書き込みは発生しない。
  const counted = await db
    .prepare("SELECT COUNT(*) AS n FROM articles WHERE published_at < ?1")
    .bind(cutoff)
    .first<{ n: number }>();
  const deleted = counted?.n ?? 0;
  if (deleted === 0) return { deleted: 0 };

  // articles_ad トリガが DELETE に連動して articles_fts を更新するため手動 rebuild 不要
  await db.prepare("DELETE FROM articles WHERE published_at < ?1").bind(cutoff).run();
  return { deleted };
}
