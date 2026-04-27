async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
    const hash = await sha256Hex(`${feedId}${url.trim()}`);
    return `${feedId}:url:${hash.slice(0, 32)}`;
  }
  const hash = await sha256Hex(`${feedId}${title ?? ""}${publishedAt ?? ""}`);
  return `${feedId}:fallback:${hash.slice(0, 32)}`;
}

export async function buildGuids(items: BuildGuidInput[]): Promise<string[]> {
  return Promise.all(items.map((i) => buildGuid(i)));
}
