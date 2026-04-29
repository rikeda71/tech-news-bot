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
    <header className="app-header">
      <h1>
        <span className="header-logo-emoji" aria-hidden="true">
          🤖
        </span>
        Tech News Bot
      </h1>
      {onViewChange && (
        <nav className="app-nav" aria-label="ページ切替">
          {NAV_TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className={`app-nav-tab${view === id ? " active" : ""}`}
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
