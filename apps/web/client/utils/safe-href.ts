// javascript:/data:/vbscript: などの危険な URI スキームをブロックし、
// http: / https: 以外は "#" にフォールバックする
export function safeHref(url: string | undefined): string {
  if (!url) return "#";
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return "#";
}
