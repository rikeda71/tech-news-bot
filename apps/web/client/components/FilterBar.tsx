import type { FeedCategory, FeedLang, FeedSummary } from "../types/api";

interface Props {
  category: FeedCategory | "";
  lang: FeedLang | "";
  feedId: string;
  feeds: FeedSummary[];
  dateFrom: string;
  dateTo: string;
  unreadOnly: boolean;
  onCategoryChange: (c: FeedCategory | "") => void;
  onLangChange: (l: FeedLang | "") => void;
  onFeedChange: (id: string) => void;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
  onUnreadOnlyChange: (v: boolean) => void;
  onClear: () => void;
}

export function FilterBar({
  category,
  lang,
  feedId,
  feeds,
  dateFrom,
  dateTo,
  unreadOnly,
  onCategoryChange,
  onLangChange,
  onFeedChange,
  onDateFromChange,
  onDateToChange,
  onUnreadOnlyChange,
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
    unreadOnly;

  return (
    <>
      <select
        className="select"
        value={category}
        onChange={(e) => onCategoryChange(e.target.value as FeedCategory | "")}
      >
        <option value="">All categories</option>
        <option value="bigtech">Big Tech</option>
        <option value="ai">AI</option>
        <option value="jp">日本企業</option>
        <option value="zenn">Zenn</option>
      </select>

      <select
        className="select"
        value={lang}
        onChange={(e) => onLangChange(e.target.value as FeedLang | "")}
      >
        <option value="">All langs</option>
        <option value="en">English</option>
        <option value="ja">日本語</option>
      </select>

      <select className="select" value={feedId} onChange={(e) => onFeedChange(e.target.value)}>
        <option value="">All feeds</option>
        {visibleFeeds.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>

      <input
        type="date"
        className="date-input"
        value={dateFrom}
        onChange={(e) => onDateFromChange(e.target.value)}
        aria-label="期間 開始日"
      />
      <span className="date-sep">〜</span>
      <input
        type="date"
        className="date-input"
        value={dateTo}
        onChange={(e) => onDateToChange(e.target.value)}
        aria-label="期間 終了日"
      />

      <label className="unread-only-label">
        <input
          type="checkbox"
          checked={unreadOnly}
          onChange={(e) => onUnreadOnlyChange(e.target.checked)}
        />
        未読のみ
      </label>

      {hasFilter && (
        <button type="button" className="clear-filter" onClick={onClear}>
          ✕ 解除
        </button>
      )}
    </>
  );
}
