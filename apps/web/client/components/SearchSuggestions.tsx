interface Props {
  items: readonly string[];
  onPick: (q: string) => void;
  onRemove: (q: string) => void;
  onClearAll: () => void;
  visible: boolean;
}

export function SearchSuggestions({ items, onPick, onRemove, onClearAll, visible }: Props) {
  if (!visible || items.length === 0) return null;

  return (
    <ul
      id="search-suggestions"
      role="listbox"
      aria-label="検索履歴"
      className="absolute top-full left-0 right-0 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-b-[var(--radius-md)] max-h-[300px] overflow-y-auto z-50 list-none m-0 py-[var(--space-1)] shadow-[var(--shadow-md)]"
    >
      {items.map((item) => (
        <li
          key={item}
          role="option"
          aria-selected={false}
          className="flex justify-between items-center p-0"
        >
          <button
            type="button"
            className="flex-1 px-[var(--space-3)] py-[var(--space-2)] bg-transparent border-none text-[var(--fg-primary)] text-[var(--font-size-base)] font-[inherit] text-left cursor-pointer whitespace-nowrap overflow-hidden text-ellipsis transition-[background] duration-100 hover:bg-[var(--bg-overlay)] hover:text-[var(--accent)]"
            // mousedown で preventDefault することで onBlur より先に処理し、フォーカスを奪わない
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(item);
            }}
          >
            {item}
          </button>
          <button
            type="button"
            className="shrink-0 px-[var(--space-3)] py-[var(--space-2)] bg-transparent border-none text-[var(--fg-muted)] text-[var(--font-size-base)] font-[inherit] cursor-pointer opacity-60 leading-none transition-opacity duration-100 hover:opacity-100 hover:text-[var(--fg-primary)]"
            aria-label={`"${item}" を履歴から削除`}
            onMouseDown={(e) => {
              e.preventDefault();
              onRemove(item);
            }}
          >
            ×
          </button>
        </li>
      ))}
      <li className="border-t border-[var(--border-subtle)] mt-[var(--space-1)] pt-[var(--space-1)]">
        <button
          type="button"
          className="w-full px-[var(--space-3)] py-[var(--space-2)] bg-transparent border-none text-[var(--fg-muted)] text-[var(--font-size-sm)] font-[inherit] text-left cursor-pointer transition-[background] duration-100 hover:bg-[var(--bg-overlay)] hover:text-[var(--fg-primary)]"
          onMouseDown={(e) => {
            e.preventDefault();
            onClearAll();
          }}
        >
          履歴をすべて削除
        </button>
      </li>
    </ul>
  );
}
