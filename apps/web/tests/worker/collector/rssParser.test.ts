import { describe, expect, it } from "vite-plus/test";
import { parseFeed } from "../../../worker/collector/rssParser";
import sampleRss from "../../fixtures/sample-rss.xml?raw";
import sampleAtom from "../../fixtures/sample-atom.xml?raw";

describe("parseFeed", () => {
  it("parses an RSS 2.0 feed and skips items without a link", () => {
    const items = parseFeed(sampleRss, { fallbackPublishedAt: "2024-12-01T00:00:00.000Z" });
    expect(items.length).toBe(3);
    const [first, second, third] = items;
    expect.soft(first.title).toBe("Hello World");
    expect.soft(first.url).toBe("https://example.com/posts/hello");
    expect.soft(first.rawGuid).toBe("post-001");
    expect.soft(first.author).toBe("Alice");
    expect.soft(first.summary).toContain("summary");
    expect.soft(first.publishedAt).toBe(new Date("Mon, 01 Jan 2024 12:00:00 GMT").toISOString());

    expect.soft(second.rawGuid).toBeNull();
    expect.soft(second.url).toBe("https://example.com/posts/second");
    expect.soft(second.summary).toBe("Plain summary text.");

    expect.soft(third.url).toBeNull();
    expect.soft(third.title).toBe("Item with no link");
  });

  it("parses an Atom 1.0 feed", () => {
    const items = parseFeed(sampleAtom);
    expect(items.length).toBe(2);
    expect.soft(items[0].url).toBe("https://example.com/atom/1");
    expect.soft(items[0].rawGuid).toBe("tag:example.com,2024:atom:1");
    expect.soft(items[0].author).toBe("Bob");
    expect.soft(items[0].summary).toContain("Atom summary one");
    expect.soft(items[1].url).toBe("https://example.com/atom/2");
    expect.soft(items[1].summary).toContain("Body two");
  });

  it("returns empty when xml has no recognized root", () => {
    const items = parseFeed("<unknown><foo/></unknown>");
    expect(items).toEqual([]);
  });
});
