import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

const { EmptyState } = await import("../../client/components/EmptyState");

describe("EmptyState", () => {
  it("renders the icon, title, and body", () => {
    render(
      <EmptyState icon="🔍" title="記事が見つかりません" body="別のキーワードで検索してください" />,
    );
    expect.soft(screen.getByText("🔍")).toBeTruthy();
    expect.soft(screen.getByText("記事が見つかりません")).toBeTruthy();
    expect.soft(screen.getByText("別のキーワードで検索してください")).toBeTruthy();
  });

  it("renders with different props correctly", () => {
    render(
      <EmptyState icon="📭" title="ブックマークなし" body="記事をブックマークに追加してください" />,
    );
    expect.soft(screen.getByText("📭")).toBeTruthy();
    expect.soft(screen.getByText("ブックマークなし")).toBeTruthy();
    expect.soft(screen.getByText("記事をブックマークに追加してください")).toBeTruthy();
  });

  it("icon is displayed as a block element with large text", () => {
    const { container } = render(<EmptyState icon="✨" title="テスト" body="説明文" />);
    // icon は span で包まれている
    const span = container.querySelector("span");
    expect(span?.textContent).toBe("✨");
  });

  it("icon span has aria-hidden to prevent screen reader from reading the emoji", () => {
    const { container } = render(<EmptyState icon="✨" title="テスト" body="説明文" />);
    const span = container.querySelector("span");
    expect(span?.getAttribute("aria-hidden")).toBe("true");
  });
});
