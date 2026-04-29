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

const CATEGORY_META: Record<string, { icon: string; description: string }> = {
  bigtech: { icon: "🏢", description: "Big Tech 企業の技術ブログ" },
  ai: { icon: "🤖", description: "AI・機械学習関連の最新情報" },
  jp: { icon: "🇯🇵", description: "国内企業のエンジニアブログ" },
  zenn: { icon: "📝", description: "Zenn のトレンド記事" },
};

// カテゴリカードの左ボーダー色: CSS custom properties を任意プロパティ記法で参照
const CATEGORY_BORDER_CLASS: Record<string, string> = {
  bigtech: "border-l-[4px] border-l-[var(--cat-bigtech)]",
  ai: "border-l-[4px] border-l-[var(--cat-ai)]",
  jp: "border-l-[4px] border-l-[var(--cat-jp)]",
  zenn: "border-l-[4px] border-l-[var(--cat-zenn)]",
};

// カテゴリバッジの色
const CATEGORY_BADGE_CLASS: Record<string, string> = {
  bigtech: "bg-[var(--cat-bigtech-bg)] text-[var(--cat-bigtech)]",
  ai: "bg-[var(--cat-ai-bg)] text-[var(--cat-ai)]",
  jp: "bg-[var(--cat-jp-bg)] text-[var(--cat-jp)]",
  zenn: "bg-[var(--cat-zenn-bg)] text-[var(--cat-zenn)]",
};

interface Props {
  onSelectCategory: (id: FeedCategory) => void;
}

export function CategoriesOverview({ onSelectCategory }: Props) {
  const { categories, isLoading, error } = useCategories();

  if (isLoading) {
    return (
      <div className="text-center text-[var(--fg-muted)] py-[var(--space-8)] px-[var(--space-3)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-lg)] mt-[var(--space-4)] text-[var(--font-size-base)] leading-[var(--line-height-relaxed)]">
        読み込み中…
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-[var(--danger)] py-[var(--space-8)] px-[var(--space-3)] border border-[rgba(207,34,46,0.3)] rounded-[var(--radius-lg)] mt-[var(--space-4)] text-[var(--font-size-base)] leading-[var(--line-height-relaxed)] bg-[var(--danger-soft)]">
        取得エラー: {error}
      </div>
    );
  }

  if (!categories) return null;

  return (
    <div className="py-[var(--space-2)]">
      <h2 className="text-[var(--font-size-xl)] font-bold m-0 mb-[var(--space-5)] tracking-[-0.01em]">
        カテゴリ一覧
      </h2>
      <div className="grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2">
        {categories.map((cat) => {
          const meta = CATEGORY_META[cat.id];
          const borderClass = CATEGORY_BORDER_CLASS[cat.id] ?? "";
          const badgeClass =
            CATEGORY_BADGE_CLASS[cat.id] ?? "bg-[var(--accent-soft)] text-[var(--accent)]";
          return (
            <button
              key={cat.id}
              type="button"
              className={`relative flex flex-col gap-[var(--space-3)] p-[var(--space-5)] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)] overflow-hidden cursor-pointer text-left text-[var(--fg-primary)] text-[var(--font-size-base)] font-[inherit] transition-[box-shadow,transform,border-color] duration-200 hover:shadow-[var(--shadow-lg)] hover:-translate-y-[3px] focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 ${borderClass}`}
              onClick={() => onSelectCategory(cat.id)}
            >
              {/* カードヘッダ (アイコン + タイトル) */}
              <div className="flex items-center gap-[var(--space-3)]">
                <span className="text-[2rem] leading-none shrink-0" aria-hidden="true">
                  {meta?.icon ?? "📁"}
                </span>
                <div className="flex flex-col gap-[3px]">
                  <span className="text-[var(--font-size-lg)] font-bold leading-[var(--line-height-tight)]">
                    {cat.label}
                  </span>
                  <span
                    className={`inline-flex items-center px-[var(--space-2)] py-0.5 rounded-full text-[var(--font-size-xs)] font-semibold uppercase tracking-[0.04em] border-none leading-[var(--line-height-tight)] whitespace-nowrap self-start ${badgeClass}`}
                  >
                    {cat.id}
                  </span>
                </div>
              </div>
              {meta?.description && (
                <p className="m-0 text-[var(--font-size-sm)] text-[var(--fg-muted)] leading-[var(--line-height-relaxed)]">
                  {meta.description}
                </p>
              )}
              {/* 統計情報 */}
              <div className="flex flex-col gap-[var(--space-2)] pt-[var(--space-2)] border-t border-[var(--border-subtle)]">
                <div className="flex justify-between items-baseline gap-[var(--space-2)]">
                  <span className="text-[var(--fg-muted)] text-[var(--font-size-sm)]">
                    フィード数
                  </span>
                  <span className="font-semibold text-[var(--font-size-base)]">
                    {cat.feeds_count}
                  </span>
                </div>
                <div className="flex justify-between items-baseline gap-[var(--space-2)]">
                  <span className="text-[var(--fg-muted)] text-[var(--font-size-sm)]">
                    30 日の記事数
                  </span>
                  <span className="font-semibold text-[var(--font-size-base)]">
                    {cat.articles_30d}
                  </span>
                </div>
                <div className="flex justify-between items-baseline gap-[var(--space-2)]">
                  <span className="text-[var(--fg-muted)] text-[var(--font-size-sm)]">
                    最終公開
                  </span>
                  <span className="font-semibold text-[var(--font-size-base)]">
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
