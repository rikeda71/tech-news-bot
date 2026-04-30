import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

const { ShortcutsHelp } = await import("../../client/components/ShortcutsHelp");

describe("ShortcutsHelp", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(<ShortcutsHelp open={false} onClose={vi.fn<() => void>()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the modal when open is true", () => {
    render(<ShortcutsHelp open={true} onClose={vi.fn<() => void>()} />);
    expect.soft(screen.getByRole("dialog")).toBeTruthy();
    expect.soft(screen.getByText("キーボードショートカット")).toBeTruthy();
  });

  it("shows all shortcut rows", () => {
    render(<ShortcutsHelp open={true} onClose={vi.fn<() => void>()} />);
    // j/k, Enter, b, /, ?, g g, G, Esc の各ショートカット説明を確認
    expect.soft(screen.getByText("次の記事に移動")).toBeTruthy();
    expect.soft(screen.getByText("前の記事に移動")).toBeTruthy();
    expect.soft(screen.getByText("選択中の記事を新規タブで開く")).toBeTruthy();
    expect.soft(screen.getByText("選択中の記事をブックマーク切り替え")).toBeTruthy();
    expect.soft(screen.getByText("検索ボックスにフォーカス")).toBeTruthy();
    expect.soft(screen.getByText("このヘルプを開く / 閉じる")).toBeTruthy();
    expect.soft(screen.getByText("ヘルプを閉じる / 選択解除")).toBeTruthy();
  });

  it("calls onClose when close button is clicked", async () => {
    const onClose = vi.fn<() => void>();
    const user = userEvent.setup();
    render(<ShortcutsHelp open={true} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when overlay backdrop is clicked", async () => {
    const onClose = vi.fn<() => void>();
    const user = userEvent.setup();
    render(<ShortcutsHelp open={true} onClose={onClose} />);
    const overlay = screen.getByRole("dialog");
    await user.click(overlay);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose when modal content is clicked", async () => {
    const onClose = vi.fn<() => void>();
    const user = userEvent.setup();
    render(<ShortcutsHelp open={true} onClose={onClose} />);
    await user.click(screen.getByText("キーボードショートカット"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("has aria-modal attribute set to true", () => {
    render(<ShortcutsHelp open={true} onClose={vi.fn<() => void>()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });
});
