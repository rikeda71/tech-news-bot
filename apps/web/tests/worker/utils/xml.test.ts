import { describe, expect, it } from "vite-plus/test";
import { asArray, parseXml, pickText, stripHtml } from "../../../worker/utils/xml";

// parseXml が返す型は unknown なので、テスト内では型アサーションで扱う
type ParsedObj = Record<string, unknown>;

const RSS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <link>https://example.com</link>
    <item>
      <title>Post One</title>
      <link>https://example.com/1</link>
      <guid>guid-001</guid>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Atom Entry</title>
    <id>tag:example.com,2024:1</id>
    <link rel="alternate" href="https://example.com/atom/1"/>
    <updated>2024-01-01T00:00:00Z</updated>
  </entry>
</feed>`;

const RDF_XML = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns="http://purl.org/rss/1.0/">
  <channel rdf:about="https://example.com">
    <title>RDF Feed</title>
    <link>https://example.com</link>
  </channel>
  <item rdf:about="https://example.com/rdf/1">
    <title>RDF Item</title>
    <link>https://example.com/rdf/1</link>
  </item>
</rdf:RDF>`;

describe("parseXml", () => {
  describe("RSS 2.0", () => {
    it("parses RSS 2.0 and returns an object with rss root", () => {
      const result = parseXml(RSS_XML) as ParsedObj;
      expect(typeof result).toBe("object");
      expect("rss" in result).toBe(true);
    });

    it("parses channel title from RSS", () => {
      const result = parseXml(RSS_XML) as { rss: { channel: { title: string } } };
      expect(result.rss.channel.title).toBe("Test Feed");
    });

    it("parses item title from RSS", () => {
      const result = parseXml(RSS_XML) as {
        rss: { channel: { item: { title: string; link: string; guid: string } } };
      };
      const item = result.rss.channel.item;
      expect.soft(item.title).toBe("Post One");
      expect.soft(item.link).toBe("https://example.com/1");
      expect.soft(item.guid).toBe("guid-001");
    });
  });

  describe("Atom 1.0", () => {
    it("parses Atom and returns an object with feed root", () => {
      const result = parseXml(ATOM_XML) as ParsedObj;
      expect(typeof result).toBe("object");
      expect("feed" in result).toBe(true);
    });

    it("parses feed title from Atom", () => {
      const result = parseXml(ATOM_XML) as { feed: { title: string } };
      expect(result.feed.title).toBe("Atom Feed");
    });

    it("parses entry from Atom", () => {
      const result = parseXml(ATOM_XML) as { feed: { entry: { title: string; id: string } } };
      const entry = result.feed.entry;
      expect.soft(entry.title).toBe("Atom Entry");
      expect.soft(entry.id).toBe("tag:example.com,2024:1");
    });
  });

  describe("RDF / RSS 1.0", () => {
    it("parses RDF and returns an object with rdf:RDF root", () => {
      const result = parseXml(RDF_XML) as ParsedObj;
      expect("rdf:RDF" in result).toBe(true);
    });
  });

  describe("CDATA handling", () => {
    it("preserves CDATA content", () => {
      const xml = `<root><body><![CDATA[<p>Hello</p>]]></body></root>`;
      const result = parseXml(xml) as { root: { body: { "#cdata": string } } };
      expect(result.root.body["#cdata"]).toBe("<p>Hello</p>");
    });
  });

  describe("attribute handling", () => {
    it("captures attributes with @_ prefix", () => {
      const xml = `<rss version="2.0"><channel><title>T</title></channel></rss>`;
      const result = parseXml(xml) as { rss: { "@_version": string } };
      expect(result.rss["@_version"]).toBe("2.0");
    });
  });

  describe("invalid / malformed XML", () => {
    it("does not throw on empty string (returns empty object or partial parse)", () => {
      expect(() => parseXml("")).not.toThrow();
    });

    it("does not throw on plain text (non-XML)", () => {
      expect(() => parseXml("just plain text no tags")).not.toThrow();
    });
  });
});

describe("pickText", () => {
  it("returns null for null input", () => {
    expect(pickText(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(pickText(undefined)).toBeNull();
  });

  it("returns the string itself when input is a string", () => {
    expect(pickText("hello")).toBe("hello");
  });

  it("returns empty string unchanged when input is empty string", () => {
    expect(pickText("")).toBe("");
  });

  it("converts number to string", () => {
    expect(pickText(42)).toBe("42");
  });

  it("converts boolean to string", () => {
    expect(pickText(true)).toBe("true");
    expect(pickText(false)).toBe("false");
  });

  it("picks #text from object with #text property", () => {
    expect(pickText({ "#text": "extracted" })).toBe("extracted");
  });

  it("picks #cdata from object with #cdata property when no #text", () => {
    expect(pickText({ "#cdata": "cdata-content" })).toBe("cdata-content");
  });

  it("prefers #text over #cdata when both exist", () => {
    expect(pickText({ "#text": "text-wins", "#cdata": "cdata-here" })).toBe("text-wins");
  });

  it("returns null for object without #text or #cdata", () => {
    expect(pickText({ href: "https://example.com" })).toBeNull();
  });

  it("picks first non-null string from array", () => {
    expect(pickText([null, undefined, "found", "second"])).toBe("found");
  });

  it("skips empty string in array and returns next non-empty value", () => {
    expect(pickText(["", "found"])).toBe("found");
  });

  it("returns null for empty array", () => {
    expect(pickText([])).toBeNull();
  });

  it("returns null for array of all nulls/undefineds", () => {
    expect(pickText([null, undefined])).toBeNull();
  });

  it("picks string from nested object inside array", () => {
    expect(pickText([{ "#text": "nested" }])).toBe("nested");
  });
});

describe("asArray", () => {
  it("returns empty array for undefined", () => {
    expect(asArray(undefined)).toEqual([]);
  });

  it("returns empty array for null", () => {
    expect(asArray(null)).toEqual([]);
  });

  it("wraps a single string value in an array", () => {
    expect(asArray("single")).toEqual(["single"]);
  });

  it("wraps a single object value in an array", () => {
    const obj = { title: "foo" };
    expect(asArray(obj)).toEqual([obj]);
  });

  it("returns the array as-is when input is already an array", () => {
    const arr = ["a", "b", "c"];
    expect(asArray(arr)).toBe(arr);
  });

  it("returns empty array for empty array input", () => {
    expect(asArray([])).toEqual([]);
  });

  it("preserves multi-element arrays", () => {
    const arr = [{ id: 1 }, { id: 2 }];
    expect(asArray(arr)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("wraps number in an array", () => {
    expect(asArray(0)).toEqual([0]);
    expect(asArray(99)).toEqual([99]);
  });
});

describe("stripHtml", () => {
  it("returns null for null input", () => {
    expect(stripHtml(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(stripHtml(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(stripHtml("")).toBeNull();
  });

  it("strips basic HTML tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  it("strips script tags and their content", () => {
    expect(stripHtml("<p>text</p><script>alert('xss')</script>")).toBe("text");
  });

  it("strips style tags and their content", () => {
    expect(stripHtml("<style>body{color:red}</style><p>text</p>")).toBe("text");
  });

  it("decodes common HTML entities", () => {
    // &nbsp; はスペースに変換され trim() で末尾スペースは除去される
    expect(stripHtml("&amp;&lt;&gt;&quot;&#39;&nbsp;")).toBe("&<>\"'");
  });

  it("truncates to maxLen and appends ellipsis", () => {
    expect(stripHtml("Hello world", 5)).toBe("Hello…");
  });

  it("does not truncate when text is shorter than maxLen", () => {
    expect(stripHtml("Hi", 10)).toBe("Hi");
  });

  it("removes XML 1.0 forbidden control characters (U+0000-U+0008)", () => {
    // NUL, SOH, STX, ETX, EOT, ENQ, ACK, BEL, BS はすべて除去される
    const withControl = "hello\x00\x01\x02\x03\x04\x05\x06\x07\x08world";
    expect(stripHtml(withControl)).toBe("helloworld");
  });

  it("removes XML 1.0 forbidden control characters (U+000B, U+000C)", () => {
    // VT (vertical tab) と FF (form feed) は XML 1.0 で禁止
    const withControl = "hello\x0B\x0Cworld";
    expect(stripHtml(withControl)).toBe("helloworld");
  });

  it("removes XML 1.0 forbidden control characters (U+000E-U+001F)", () => {
    // SO through US は XML 1.0 で禁止
    const withControl = "hello\x0E\x1Fworld";
    expect(stripHtml(withControl)).toBe("helloworld");
  });

  it("preserves tab (U+0009), LF (U+000A), CR (U+000D) as whitespace", () => {
    // tab / LF / CR は XML 1.0 で許可されているホワイトスペース。\s+ で空白に正規化される
    const withAllowed = "hello\x09\x0A\x0Dworld";
    expect(stripHtml(withAllowed)).toBe("hello world");
  });

  it("returns null when input contains only control characters", () => {
    expect(stripHtml("\x01\x02\x03")).toBeNull();
  });
});
