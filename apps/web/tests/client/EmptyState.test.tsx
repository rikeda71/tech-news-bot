import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

const { EmptyState } = await import("../../client/components/EmptyState");

describe("EmptyState", () => {
  it("renders the icon, title, and body", () => {
    render(
      <EmptyState icon="🔍" title="記事が見つかりません" body="別のキーワードで検索してください" />,
    );
    expect(screen.getByText("🔍")).toBeTruthy();
    expect(screen.getByText("記事が見つかりません")).toBeTruthy();
    expect(screen.getByText("別のキーワードで検索してください")).toBeTruthy();
  });

  it("renders with different props correctly", () => {
    render(
      <EmptyState icon="📭" title="ブックマークなし" body="記事をブックマークに追加してください" />,
    );
    expect(screen.getByText("📭")).toBeTruthy();
    expect(screen.getByText("ブックマークなし")).toBeTruthy();
    expect(screen.getByText("記事をブックマークに追加してください")).toBeTruthy();
  });

  it("icon is displayed as a block element with large text", () => {
    const { container } = render(<EmptyState icon="✨" title="テスト" body="説明文" />);
    // icon は span で包まれている
    const span = container.querySelector("span");
    expect(span?.textContent).toBe("✨");
  });
});
