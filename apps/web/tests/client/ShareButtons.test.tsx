import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vite-plus/test";
import { ShareButtons } from "../../client/components/ShareButtons";

const TEST_URL = "https://example.com/article?q=hello world";
const TEST_TITLE = "Sample & Article <Title>";

describe("ShareButtons", () => {
  it("X anchor href encodes url and title", () => {
    render(<ShareButtons url={TEST_URL} title={TEST_TITLE} />);
    const xLink = screen.getByRole("link", { name: /X \(Twitter\)/i });
    const href = xLink.getAttribute("href") ?? "";
    expect.soft(href).toContain("twitter.com/intent/tweet");
    expect.soft(href).toContain(encodeURIComponent(TEST_URL));
    expect.soft(href).toContain(encodeURIComponent(TEST_TITLE));
  });

  it("Hatena anchor href encodes url and title", () => {
    render(<ShareButtons url={TEST_URL} title={TEST_TITLE} />);
    const hatenaLink = screen.getByRole("link", { name: /はてなブックマーク/i });
    const href = hatenaLink.getAttribute("href") ?? "";
    expect.soft(href).toContain("b.hatena.ne.jp/add");
    expect.soft(href).toContain(encodeURIComponent(TEST_URL));
    expect.soft(href).toContain(encodeURIComponent(TEST_TITLE));
  });

  it("X and Hatena links open in new tab with noopener noreferrer", () => {
    render(<ShareButtons url={TEST_URL} title={TEST_TITLE} />);
    for (const label of [/X \(Twitter\)/i, /はてなブックマーク/i]) {
      const link = screen.getByRole("link", { name: label });
      expect.soft(link.getAttribute("target")).toBe("_blank");
      expect.soft(link.getAttribute("rel")).toContain("noopener");
      expect.soft(link.getAttribute("rel")).toContain("noreferrer");
    }
  });

  it("all interactive elements have aria-label", () => {
    render(<ShareButtons url={TEST_URL} title={TEST_TITLE} />);
    expect.soft(screen.getByRole("link", { name: /X \(Twitter\)/i })).toBeTruthy();
    expect.soft(screen.getByRole("link", { name: /はてなブックマーク/i })).toBeTruthy();
    expect.soft(screen.getByRole("button", { name: /URLをコピー/i })).toBeTruthy();
  });

  it("copy button click succeeds and shows copied state via aria-label", async () => {
    // happy-dom は Clipboard API を実装しているため writeText は実際に呼ばれる。
    // コピー後は aria-label が "コピー済み" に変わることで copied 状態を確認する。
    const user = userEvent.setup();
    render(<ShareButtons url={TEST_URL} title={TEST_TITLE} />);

    const copyBtn = screen.getByRole("button", { name: /URLをコピー/i });
    await user.click(copyBtn);

    // writeText 成功後に aria-label が "コピー済み" になることで copied 状態を確認
    expect(screen.getByRole("button", { name: "コピー済み" })).toBeTruthy();
  });
});
