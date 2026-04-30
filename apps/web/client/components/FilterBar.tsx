import type { FeedCategory, FeedLang, FeedSummary } from "../types/api";

interface Props {
  category: FeedCategory | "";
  lang: FeedLang | "";
  feedId: string;
  feeds: FeedSummary[];
  dateFrom: string;
  dateTo: string;
  unreadOnly: boolean;
  starredOnly: boolean;
  onCategoryChange: (c: FeedCategory | "") => void;
  onLangChange: (l: FeedLang | "") => void;
  onFeedChange: (id: string) => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onUnreadOnlyChange: (v: boolean) => void;
  onStarredOnlyChange: (v: boolean) => void;
  onClear: () => void;
}

// select / date-input の共通スタイル
const inputClass =
  "px-[var(--space-3)] py-[var(--space-2)] bg-[var(--bg-overlay)] text-[var(--fg-primary)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--font-size-sm)] font-[inherit] cursor-pointer transition-[border-color] duration-100 focus:outline-2 focus:outline-[var(--accent)] focus:outline-offset-2";

export function FilterBar({
  category,
  lang,
  feedId,
  feeds,
  dateFrom,
  dateTo,
  unreadOnly,
  starredOnly,
  onCategoryChange,
  onLangChange,
  onFeedChange,
  onDateFromChange,
  onDateToChange,
  onUnreadOnlyChange,
  onStarredOnlyChange,
  onClear,
}: Props) {
  const visibleFeeds = feeds
    .filter((f) => (category ? f.category === category : true))
    .filter((f) => (lang ? f.lang === lang : true));

  const hasFilter =
    category !== "" ||
    lang !== "" ||
    feedId !== "" ||
    dateFrom !== "" ||
    dateTo !== "" ||
    unreadOnly ||
    starredOnly;

  return (
    <>
      <select
        className={`${inputClass} min-w-[130px]`}
        value={category}
        aria-label="カテゴリ"
        onChange={(e) => onCategoryChange(e.target.value as FeedCategory | "")}
      >
        <option value="">All categories</option>
        <option value="bigtech">Big Tech</option>
        <option value="ai">AI</option>
        <option value="jp">日本企業</option>
        <option value="personal">個人ブログ</option>
      </select>

      <select
        className={`${inputClass} min-w-[130px]`}
        value={lang}
        aria-label="言語"
        onChange={(e) => onLangChange(e.target.value as FeedLang | "")}
      >
        <option value="">All langs</option>
        <option value="en">English</option>
        <option value="ja">日本語</option>
      </select>

      <select
        className={`${inputClass} min-w-[130px]`}
        value={feedId}
        aria-label="フィード"
        onChange={(e) => onFeedChange(e.target.value)}
      >
        <option value="">All feeds</option>
        {visibleFeeds.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>

      <input
        type="date"
        className={inputClass}
        value={dateFrom}
        onChange={(e) => onDateFromChange(e.target.value)}
        aria-label="期間 開始日"
      />
      <span className="text-[var(--fg-muted)] px-[2px] text-[var(--font-size-sm)]">〜</span>
      <input
        type="date"
        className={inputClass}
        value={dateTo}
        onChange={(e) => onDateToChange(e.target.value)}
        aria-label="期間 終了日"
      />

      <label className="flex items-center gap-[var(--space-2)] text-[var(--fg-muted)] text-[var(--font-size-sm)] cursor-pointer whitespace-nowrap select-none">
        <input
          type="checkbox"
          className="cursor-pointer accent-[var(--accent)] w-[14px] h-[14px]"
          checked={unreadOnly}
          onChange={(e) => onUnreadOnlyChange(e.target.checked)}
        />
        未読のみ
      </label>

      <label className="flex items-center gap-[var(--space-2)] text-[var(--fg-muted)] text-[var(--font-size-sm)] cursor-pointer whitespace-nowrap select-none">
        <input
          type="checkbox"
          className="cursor-pointer accent-[var(--accent)] w-[14px] h-[14px]"
          checked={starredOnly}
          onChange={(e) => onStarredOnlyChange(e.target.checked)}
        />
        ★のみ
      </label>

      {hasFilter && (
        <button
          type="button"
          className="px-[var(--space-3)] py-[var(--space-2)] bg-[var(--bg-overlay)] text-[var(--fg-muted)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--font-size-sm)] font-[inherit] cursor-pointer whitespace-nowrap transition-[border-color,color] duration-100 hover:border-[var(--accent)] hover:text-[var(--fg-primary)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
          onClick={onClear}
        >
          ✕ 解除
        </button>
      )}
    </>
  );
}
