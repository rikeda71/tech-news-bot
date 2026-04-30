import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  cdataPropName: "#cdata",
  removeNSPrefix: false,
  allowBooleanAttributes: true,
});

export function parseXml(xml: string): unknown {
  return parser.parse(xml);
}

// XML 1.0 で禁止されている制御文字 (U+0000-U+0008, U+000B, U+000C, U+000E-U+001F)
// RSS/Atom 本文に含まれていると、XML 出力時に Invalid XML になるため除去する
// oxlint-disable-next-line no-control-regex -- 意図的に制御文字を対象とした正規表現
const XML_INVALID_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

export function stripHtml(input: string | null | undefined, maxLen?: number): string | null {
  if (!input) return null;
  const text = input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(XML_INVALID_CHARS_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (typeof maxLen === "number" && text.length > maxLen) {
    return text.slice(0, maxLen).trimEnd() + "…";
  }
  return text;
}

export function pickText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    for (const v of value) {
      const t = pickText(v);
      if (t) return t;
    }
    return null;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return obj["#text"];
    if (typeof obj["#cdata"] === "string") return obj["#cdata"];
  }
  return null;
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
