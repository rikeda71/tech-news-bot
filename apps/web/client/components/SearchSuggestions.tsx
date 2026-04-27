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
    <ul role="listbox" className="search-suggestions">
      {items.map((item) => (
        <li key={item} role="option" aria-selected={false} className="search-suggestion-item">
          <button
            type="button"
            className="search-suggestion-pick"
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
            className="search-suggestion-remove"
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
      <li className="search-suggestion-clear-row">
        <button
          type="button"
          className="search-suggestion-clear-all"
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
