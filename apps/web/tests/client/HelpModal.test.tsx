import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

const { HelpModal } = await import("../../client/components/HelpModal");

describe("HelpModal", () => {
  it("renders nothing when open=false", () => {
    const { container } = render(<HelpModal open={false} onClose={vi.fn<() => void>()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the dialog with shortcut table when open=true", () => {
    render(<HelpModal open={true} onClose={vi.fn<() => void>()} />);
    expect.soft(screen.getByRole("dialog")).toBeTruthy();
    expect.soft(screen.getByText("キーボードショートカット")).toBeTruthy();
  });

  it("shows shortcut rows in the table", () => {
    render(<HelpModal open={true} onClose={vi.fn<() => void>()} />);
    // HelpModal に定義されているショートカット説明が表示されているか確認
    expect.soft(screen.getByText("次の記事に移動")).toBeTruthy();
    expect.soft(screen.getByText("前の記事に移動")).toBeTruthy();
    expect.soft(screen.getByText("検索ボックスにフォーカス")).toBeTruthy();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn<() => void>();
    const user = userEvent.setup();
    render(<HelpModal open={true} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when overlay backdrop is clicked", async () => {
    const onClose = vi.fn<() => void>();
    const user = userEvent.setup();
    render(<HelpModal open={true} onClose={onClose} />);
    // dialog 要素 (backdrop) をクリック
    await user.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose when modal content area is clicked", async () => {
    const onClose = vi.fn<() => void>();
    const user = userEvent.setup();
    render(<HelpModal open={true} onClose={onClose} />);
    // h2 タイトルをクリックしても閉じない (stopPropagation による)
    await user.click(screen.getByText("キーボードショートカット"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("has aria-modal attribute", () => {
    render(<HelpModal open={true} onClose={vi.fn<() => void>()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });
});
