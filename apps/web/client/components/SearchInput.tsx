import { forwardRef, useEffect, useState } from "react";

interface Props {
  value: string;
  onChange: (q: string) => void;
  delayMs?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const SearchInput = forwardRef<HTMLInputElement, Props>(function SearchInput(
  { value, onChange, delayMs = 300, onFocus, onBlur },
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
      className="search-input"
      placeholder="記事を検索 (タイトル / 概要)"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
    />
  );
});
