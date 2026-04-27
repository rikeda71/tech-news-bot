import type { ReactNode } from "react";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function highlight(text: string, q: string): ReactNode {
  if (!q) return text;
  const re = new RegExp(`(${escapeRegex(q)})`, "ig");
  const parts = text.split(re);
  // split with a capture group alternates: non-match, match, non-match, ...
  return parts.map((part, i) =>
    // even indices are non-matches, odd indices are the captured matches
    i % 2 === 1 ? <mark key={i}>{part}</mark> : part,
  );
}
