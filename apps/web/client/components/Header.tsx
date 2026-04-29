import { ThemeToggle } from "./ThemeToggle";
import { useTheme } from "../hooks/useTheme";

// "feed" は /feed/:id のフィード詳細ページで使用。nav タブには載せない
// "author" は /author/:name の著者詳細ページで使用。nav タブには載せない
export type AppView = "articles" | "stats" | "feed" | "author" | "categories";

interface HeaderProps {
  view?: AppView;
  onViewChange?: (view: AppView) => void;
}

const NAV_TABS: Array<{ id: AppView; label: string; icon: string }> = [
  { id: "articles", label: "Articles", icon: "📰" },
  { id: "stats", label: "Stats", icon: "📊" },
  { id: "categories", label: "カテゴリ", icon: "🗂️" },
];

export function Header({ view, onViewChange }: HeaderProps) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-[100] flex items-center gap-[var(--space-4)] h-[var(--header-height)] px-[var(--space-4)] bg-[var(--bg-base)] border-b border-[var(--border-subtle)] shadow-[var(--shadow-sm)] max-w-full backdrop-blur-[8px] [-webkit-backdrop-filter:blur(8px)] transition-shadow duration-100">
      <h1 className="m-0 text-[var(--font-size-md)] font-bold whitespace-nowrap shrink-0 tracking-[-0.02em]">
        <span className="mr-[var(--space-1)]" aria-hidden="true">
          🤖
        </span>
        Tech News Bot
      </h1>
      {onViewChange && (
        <nav
          className="flex items-center gap-[var(--space-1)] flex-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          aria-label="ページ切替"
        >
          {NAV_TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className={`inline-flex items-center gap-[5px] px-[var(--space-3)] py-[5px] bg-transparent text-[var(--fg-muted)] border-none rounded-full text-[var(--font-size-sm)] font-[inherit] font-medium cursor-pointer whitespace-nowrap transition-[background,color] duration-100 hover:bg-[var(--bg-elevated)] hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2${
                view === id ? " bg-[var(--accent-soft)] text-[var(--accent)] font-semibold" : ""
              }`}
              onClick={() => onViewChange(id)}
              aria-current={view === id ? "page" : undefined}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
      )}
      <ThemeToggle theme={theme} onSetTheme={setTheme} />
    </header>
  );
}
