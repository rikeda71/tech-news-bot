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
      className="bookmark-button"
      onClick={() => toggle(guid)}
      aria-label={bookmarked ? "ブックマークから削除" : "ブックマークに追加"}
      aria-pressed={bookmarked}
    >
      {bookmarked ? "★" : "☆"}
    </button>
  );
}
