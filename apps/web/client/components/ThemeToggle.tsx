import type { Theme } from "../hooks/useTheme";

interface Props {
  theme: Theme;
  onSetTheme: (t: Theme) => void;
}

function SunIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

export function ThemeToggle({ theme, onSetTheme }: Props) {
  return (
    <div className="theme-toggle-group" role="group" aria-label="テーマ切替">
      <button
        type="button"
        className={`theme-toggle-btn${theme === "light" ? " active" : ""}`}
        aria-pressed={theme === "light"}
        aria-label="ライトモード"
        title="ライトモード"
        onClick={() => onSetTheme("light")}
      >
        <SunIcon />
      </button>
      <button
        type="button"
        className={`theme-toggle-btn${theme === "system" ? " active" : ""}`}
        aria-pressed={theme === "system"}
        aria-label="OS設定に追従"
        title="OS設定に追従"
        onClick={() => onSetTheme("system")}
      >
        <SystemIcon />
      </button>
      <button
        type="button"
        className={`theme-toggle-btn${theme === "dark" ? " active" : ""}`}
        aria-pressed={theme === "dark"}
        aria-label="ダークモード"
        title="ダークモード"
        onClick={() => onSetTheme("dark")}
      >
        <MoonIcon />
      </button>
    </div>
  );
}
