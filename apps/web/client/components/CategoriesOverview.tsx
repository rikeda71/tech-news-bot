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

const CATEGORY_META: Record<
  string,
  { icon: string; description: string }
> = {
  bigtech: { icon: "🏢", description: "Big Tech 企業の技術ブログ" },
  ai: { icon: "🤖", description: "AI・機械学習関連の最新情報" },
  jp: { icon: "🇯🇵", description: "国内企業のエンジニアブログ" },
  zenn: { icon: "📝", description: "Zenn のトレンド記事" },
};

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
        {categories.map((cat) => {
          const meta = CATEGORY_META[cat.id];
          return (
            <button
              key={cat.id}
              type="button"
              className={`category-card cat-${cat.id}`}
              onClick={() => onSelectCategory(cat.id)}
            >
              <div className="category-card-header">
                <span className="category-card-icon" aria-hidden="true">
                  {meta?.icon ?? "📁"}
                </span>
                <div className="category-card-title">
                  <span className="category-card-name">{cat.label}</span>
                  <span className={`category-card-badge badge cat-${cat.id}`}>{cat.id}</span>
                </div>
              </div>
              {meta?.description && (
                <p
                  style={{
                    margin: 0,
                    fontSize: "var(--font-size-sm)",
                    color: "var(--fg-muted)",
                    lineHeight: "var(--line-height-relaxed)",
                  }}
                >
                  {meta.description}
                </p>
              )}
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
          );
        })}
      </div>
    </div>
  );
}
