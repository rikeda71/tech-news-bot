import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vite-plus/test";

const { BookmarkButton } = await import("../../client/components/BookmarkButton");

describe("BookmarkButton", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders with aria-pressed=false when not bookmarked", () => {
    render(<BookmarkButton guid="article-1" />);
    const btn = screen.getByRole("button", { name: "ブックマークに追加" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows bookmark icon depending on state", () => {
    render(<BookmarkButton guid="article-2" />);
    // 未ブックマーク時は空星
    expect(screen.getByRole("button").textContent).toContain("☆");
  });

  it("toggles aria-pressed to true after click", async () => {
    const user = userEvent.setup();
    render(<BookmarkButton guid="article-3" />);
    const btn = screen.getByRole("button");
    await user.click(btn);
    // ブックマーク追加後は aria-pressed=true になる
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(btn.textContent).toContain("★");
  });

  it("toggles back to false when clicked twice", async () => {
    const user = userEvent.setup();
    render(<BookmarkButton guid="article-4" />);
    const btn = screen.getByRole("button");
    await user.click(btn);
    await user.click(btn);
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(btn.textContent).toContain("☆");
  });

  it("aria-label reflects current state", async () => {
    const user = userEvent.setup();
    render(<BookmarkButton guid="article-5" />);
    // 未ブックマーク時
    expect(screen.getByRole("button", { name: "ブックマークに追加" })).toBeTruthy();
    await user.click(screen.getByRole("button"));
    // ブックマーク済み時
    expect(screen.getByRole("button", { name: "ブックマークから削除" })).toBeTruthy();
  });
});
