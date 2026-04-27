import { useEffect, useState } from "react";

interface Props {
  value: string;
  onChange: (q: string) => void;
  delayMs?: number;
}

export function SearchInput({ value, onChange, delayMs = 300 }: Props) {
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
      type="search"
      className="search-input"
      placeholder="記事を検索 (タイトル / 概要)"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
    />
  );
}
