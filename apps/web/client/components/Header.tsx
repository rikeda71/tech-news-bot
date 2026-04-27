import { ThemeToggle } from "./ThemeToggle";
import { useTheme } from "../hooks/useTheme";

// "feed" は /feed/:id のフィード詳細ページで使用。nav タブには載せない
// "author" は /author/:name の著者詳細ページで使用。nav タブには載せない
export type AppView = "articles" | "stats" | "feed" | "author" | "categories" | "trending";

interface HeaderProps {
  view?: AppView;
  onViewChange?: (view: AppView) => void;
}

export function Header({ view, onViewChange }: HeaderProps) {
  const { theme, setTheme } = useTheme();

  return (
    <header className="app-header">
      <h1>Tech News Bot</h1>
      {onViewChange && (
        <nav className="app-nav" aria-label="ページ切替">
          <button
            type="button"
            className={`app-nav-tab${view === "articles" ? " active" : ""}`}
            onClick={() => onViewChange("articles")}
            aria-current={view === "articles" ? "page" : undefined}
          >
            Articles
          </button>
          <button
            type="button"
            className={`app-nav-tab${view === "stats" ? " active" : ""}`}
            onClick={() => onViewChange("stats")}
            aria-current={view === "stats" ? "page" : undefined}
          >
            Stats
          </button>
          <button
            type="button"
            className={`app-nav-tab${view === "categories" ? " active" : ""}`}
            onClick={() => onViewChange("categories")}
            aria-current={view === "categories" ? "page" : undefined}
          >
            カテゴリ
          </button>
          <button
            type="button"
            className={`app-nav-tab${view === "trending" ? " active" : ""}`}
            onClick={() => onViewChange("trending")}
            aria-current={view === "trending" ? "page" : undefined}
          >
            トレンド
          </button>
        </nav>
      )}
      <ThemeToggle theme={theme} onSetTheme={setTheme} />
    </header>
  );
}
