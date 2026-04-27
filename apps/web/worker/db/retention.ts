export async function pruneOldArticles(db: D1Database, days: number): Promise<{ deleted: number }> {
  // days が 0 / 負数 / 非有限のときは no-op
  if (!Number.isFinite(days) || days <= 0) return { deleted: 0 };

  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  // meta.changes には articles_ad トリガによる FTS 更新も含まれるため、削除前に件数を取得する
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
