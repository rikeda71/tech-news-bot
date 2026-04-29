import { useBookmarks } from "../hooks/useBookmarks";

interface Props {
  guid: string;
}

export function BookmarkButton({ guid }: Props) {
  const { isBookmarked, toggle } = useBookmarks();
  const bookmarked = isBookmarked(guid);

  return (
    <button
      type="button"
      className="shrink-0 px-[2px] py-[var(--space-1)] bg-transparent text-[var(--fg-muted)] border-none text-[1rem] font-[inherit] cursor-pointer leading-none opacity-45 transition-[opacity,color] duration-100 hover:opacity-100 hover:text-[var(--accent)] aria-pressed:opacity-100 aria-pressed:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 focus-visible:rounded-[var(--radius-sm)]"
      onClick={() => toggle(guid)}
      aria-label={bookmarked ? "ブックマークから削除" : "ブックマークに追加"}
      aria-pressed={bookmarked}
    >
      {bookmarked ? "★" : "☆"}
    </button>
  );
}
