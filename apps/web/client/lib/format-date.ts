// 複数コンポーネントで重複していた日付フォーマット関数を集約

/**
 * ISO 文字列を「YYYY/MM/DD HH:mm」形式にフォーマットする。
 * ArticleCard / ReportDetail / ReportsList の generated_at / published_at 表示用。
 */
export function formatDatetime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * ISO 文字列を「M月D日 HH:mm」形式にフォーマットする。
 * Stats コンポーネントのフィード別アクティビティ表 (最終記事日時) 用。
 * year を省略し month:"short" で短縮表示する。
 */
export function formatDateShort(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
