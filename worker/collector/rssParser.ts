import { parseXml, pickText, stripHtml, asArray } from "../utils/xml";

export interface ParsedItem {
  rawGuid: string | null;
  title: string;
  url: string | null;
  summary: string | null;
  author: string | null;
  publishedAt: string;
}

export interface ParseOptions {
  summaryMaxLength?: number;
  fallbackPublishedAt?: string;
}

function toIsoDate(input: string | null | undefined, fallback: string): string {
  if (!input) return fallback;
  const trimmed = input.trim();
  if (!trimmed) return fallback;
  const t = Date.parse(trimmed);
  if (Number.isNaN(t)) return fallback;
  return new Date(t).toISOString();
}

function pickLink(entry: Record<string, unknown>): string | null {
  const link = entry["link"];
  if (typeof link === "string") return link;
  if (Array.isArray(link)) {
    let alt: string | null = null;
    for (const l of link) {
      if (typeof l === "string") return l;
      if (l && typeof l === "object") {
        const obj = l as Record<string, unknown>;
        const rel = obj["@_rel"];
        const href = obj["@_href"];
        if (typeof href === "string") {
          if (!rel || rel === "alternate") return href;
          if (!alt) alt = href;
        }
      }
    }
    if (alt) return alt;
  }
  if (link && typeof link === "object") {
    const obj = link as Record<string, unknown>;
    const href = obj["@_href"];
    if (typeof href === "string") return href;
    const text = pickText(link);
    if (text) return text;
  }
  return null;
}

function pickAtomContent(entry: Record<string, unknown>): string | null {
  return (
    pickText(entry["summary"]) ??
    pickText(entry["content"]) ??
    pickText(entry["subtitle"]) ??
    null
  );
}

function pickRssContent(entry: Record<string, unknown>): string | null {
  return (
    pickText(entry["description"]) ??
    pickText(entry["content:encoded"]) ??
    pickText(entry["summary"]) ??
    null
  );
}

function pickAuthor(entry: Record<string, unknown>): string | null {
  const candidates = [entry["author"], entry["dc:creator"], entry["creator"]];
  for (const c of candidates) {
    if (!c) continue;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const text = pickText((item as Record<string, unknown>)["name"] ?? item);
          if (text) return text;
        }
      }
    }
    if (typeof c === "object") {
      const obj = c as Record<string, unknown>;
      const text = pickText(obj["name"] ?? obj["#text"] ?? obj);
      if (text) return text;
    }
  }
  return null;
}

function pickGuid(entry: Record<string, unknown>): string | null {
  const candidates = [entry["guid"], entry["id"], entry["atom:id"]];
  for (const c of candidates) {
    const text = pickText(c);
    if (text) return text;
  }
  return null;
}

function pickPublished(entry: Record<string, unknown>): string | null {
  return (
    pickText(entry["pubDate"]) ??
    pickText(entry["published"]) ??
    pickText(entry["updated"]) ??
    pickText(entry["dc:date"]) ??
    null
  );
}

export function parseFeed(xml: string, options: ParseOptions = {}): ParsedItem[] {
  const fallback = options.fallbackPublishedAt ?? new Date().toISOString();
  const summaryMax = options.summaryMaxLength ?? 500;

  const root = parseXml(xml) as Record<string, unknown>;
  if (!root || typeof root !== "object") return [];

  const rss = root["rss"] as Record<string, unknown> | undefined;
  const rdf = root["rdf:RDF"] as Record<string, unknown> | undefined;
  const feed = root["feed"] as Record<string, unknown> | undefined;

  let entries: Record<string, unknown>[] = [];

  if (rss) {
    const channel = rss["channel"] as Record<string, unknown> | undefined;
    if (channel) {
      entries = asArray(channel["item"] as Record<string, unknown> | Record<string, unknown>[] | undefined);
    }
    return entries
      .map((e) => parseRssItem(e, fallback, summaryMax))
      .filter((x): x is ParsedItem => x !== null);
  }

  if (rdf) {
    entries = asArray(rdf["item"] as Record<string, unknown> | Record<string, unknown>[] | undefined);
    return entries
      .map((e) => parseRssItem(e, fallback, summaryMax))
      .filter((x): x is ParsedItem => x !== null);
  }

  if (feed) {
    entries = asArray(feed["entry"] as Record<string, unknown> | Record<string, unknown>[] | undefined);
    return entries
      .map((e) => parseAtomEntry(e, fallback, summaryMax))
      .filter((x): x is ParsedItem => x !== null);
  }

  return [];
}

function parseRssItem(
  entry: Record<string, unknown>,
  fallback: string,
  summaryMax: number,
): ParsedItem | null {
  const title = pickText(entry["title"]);
  if (!title) return null;
  const link = pickLink(entry);
  const rawGuid = pickGuid(entry);
  const author = pickAuthor(entry);
  const summary = stripHtml(pickRssContent(entry), summaryMax);
  const published = toIsoDate(pickPublished(entry), fallback);
  return {
    rawGuid,
    title: title.trim(),
    url: link ? link.trim() : null,
    summary,
    author,
    publishedAt: published,
  };
}

function parseAtomEntry(
  entry: Record<string, unknown>,
  fallback: string,
  summaryMax: number,
): ParsedItem | null {
  const title = pickText(entry["title"]);
  if (!title) return null;
  const link = pickLink(entry);
  const rawGuid = pickGuid(entry);
  const author = pickAuthor(entry);
  const summary = stripHtml(pickAtomContent(entry), summaryMax);
  const published = toIsoDate(pickPublished(entry), fallback);
  return {
    rawGuid,
    title: title.trim(),
    url: link ? link.trim() : null,
    summary,
    author,
    publishedAt: published,
  };
}
