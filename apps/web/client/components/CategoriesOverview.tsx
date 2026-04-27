import type { FeedCategory } from "../types/api";
import { useCategories } from "../hooks/useCategories";

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMs = Date.now() - t;
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return "今";
  if (min < 60) return `${min} 分前`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} 時間前`;
  const d = Math.round(h / 24);
  return `${d} 日前`;
}

interface Props {
  onSelectCategory: (id: FeedCategory) => void;
}

export function CategoriesOverview({ onSelectCategory }: Props) {
  const { categories, isLoading, error } = useCategories();

  if (isLoading) {
    return <div className="loader">読み込み中…</div>;
  }

  if (error) {
    return <div className="error">取得エラー: {error}</div>;
  }

  if (!categories) return null;

  return (
    <div className="categories-overview">
      <h2 className="categories-overview-title">カテゴリ一覧</h2>
      <div className="categories-grid">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`category-card cat-${cat.id}`}
            onClick={() => onSelectCategory(cat.id)}
          >
            <span className={`category-card-badge badge cat-${cat.id}`}>{cat.label}</span>
            <div className="category-card-stats">
              <div className="category-card-stat">
                <span className="category-card-stat-label">フィード数</span>
                <span className="category-card-stat-value">{cat.feeds_count}</span>
              </div>
              <div className="category-card-stat">
                <span className="category-card-stat-label">30 日の記事数</span>
                <span className="category-card-stat-value">{cat.articles_30d}</span>
              </div>
              <div className="category-card-stat">
                <span className="category-card-stat-label">最終公開</span>
                <span className="category-card-stat-value">
                  {cat.last_published_at ? formatRelative(cat.last_published_at) : "—"}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
