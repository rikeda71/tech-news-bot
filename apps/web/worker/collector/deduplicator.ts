async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * URL を正規化して GUID の衝突リスクを下げる。
 * - スキームを https に統一 (http://example.com → https://example.com)
 * - パス末尾のスラッシュを除去 (https://example.com/page/ → https://example.com/page)
 * - トリミング
 * 正規化に失敗した場合 (URL として不正など) は元の文字列をトリムして返す。
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    // http: → https: に統一
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }
    // パス末尾スラッシュを除去 ("/path/" → "/path"、"/" はそのまま)
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return trimmed;
  }
}

export interface BuildGuidInput {
  feedId: string;
  rawGuid?: string | null;
  url?: string | null;
  title?: string | null;
  publishedAt?: string | null;
}

export async function buildGuid(opts: BuildGuidInput): Promise<string> {
  const { feedId, rawGuid, url, title, publishedAt } = opts;
  if (rawGuid && rawGuid.trim()) {
    return `${feedId}:${rawGuid.trim()}`.slice(0, 255);
  }
  if (url && url.trim()) {
    const normalized = normalizeUrl(url);
    const hash = await sha256Hex(`${feedId}${normalized}`);
    return `${feedId}:url:${hash.slice(0, 32)}`;
  }
  const hash = await sha256Hex(`${feedId}${title ?? ""}${publishedAt ?? ""}`);
  return `${feedId}:fallback:${hash.slice(0, 32)}`;
}

export async function buildGuids(items: BuildGuidInput[]): Promise<string[]> {
  return Promise.all(items.map((i) => buildGuid(i)));
}
