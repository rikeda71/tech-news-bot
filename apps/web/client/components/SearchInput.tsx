import { forwardRef, useEffect, useState } from "react";

interface Props {
  value: string;
  onChange: (q: string) => void;
  delayMs?: number;
  onFocus?: () => void;
  onBlur?: () => void;
  /** サジェストドロップダウンが開いているかどうか (aria-expanded 制御用) */
  suggestVisible?: boolean;
}

export const SearchInput = forwardRef<HTMLInputElement, Props>(function SearchInput(
  { value, onChange, delayMs = 300, onFocus, onBlur, suggestVisible = false },
  ref,
) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (local !== value) onChange(local);
    }, delayMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local]);

  return (
    <input
      ref={ref}
      type="search"
      aria-label="記事を検索"
      aria-expanded={suggestVisible}
      aria-haspopup="listbox"
      aria-controls="search-suggestions"
      aria-autocomplete="list"
      className="w-full px-[var(--space-3)] py-[var(--space-2)] bg-[var(--bg-overlay)] border border-[var(--border-subtle)] rounded-[var(--radius-md)] text-[var(--fg-primary)] text-[var(--font-size-base)] font-[inherit] transition-[border-color] duration-100 placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)]"
      placeholder="記事を検索 (タイトル / 概要)"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
});
