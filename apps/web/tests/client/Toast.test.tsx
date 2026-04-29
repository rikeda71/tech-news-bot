import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import type { Toast as ToastData } from "../../client/hooks/useToast";

const { Toast } = await import("../../client/components/Toast");

const makeToast = (overrides: Partial<ToastData> = {}): ToastData => ({
  id: "toast-1",
  msg: "テスト通知",
  kind: "info",
  ...overrides,
});

describe("Toast", () => {
  it("renders the toast message", () => {
    render(<Toast toast={makeToast()} onDismiss={vi.fn<(id: string) => void>()} />);
    expect(screen.getByText("テスト通知")).toBeTruthy();
  });

  it("has role=status for screen reader accessibility", () => {
    render(<Toast toast={makeToast()} onDismiss={vi.fn<(id: string) => void>()} />);
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("has aria-live=polite", () => {
    render(<Toast toast={makeToast()} onDismiss={vi.fn<(id: string) => void>()} />);
    const el = screen.getByRole("status");
    expect(el.getAttribute("aria-live")).toBe("polite");
  });

  it("calls onDismiss with toast id when close button is clicked", async () => {
    const onDismiss = vi.fn<(id: string) => void>();
    const user = userEvent.setup();
    render(<Toast toast={makeToast({ id: "my-toast" })} onDismiss={onDismiss} />);
    await user.click(screen.getByRole("button", { name: "閉じる" }));
    expect(onDismiss).toHaveBeenCalledWith("my-toast");
  });

  it("applies success border class for kind=success", () => {
    const { container } = render(
      <Toast toast={makeToast({ kind: "success" })} onDismiss={vi.fn<(id: string) => void>()} />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("border-[var(--success)]");
  });

  it("applies error border class for kind=error", () => {
    const { container } = render(
      <Toast toast={makeToast({ kind: "error" })} onDismiss={vi.fn<(id: string) => void>()} />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("border-[var(--danger)]");
  });

  it("renders subtle border class for kind=info", () => {
    const { container } = render(
      <Toast toast={makeToast({ kind: "info" })} onDismiss={vi.fn<(id: string) => void>()} />,
    );
    const el = container.firstChild as HTMLElement;
    expect(el.className).toContain("border-[var(--border-subtle)]");
  });
});
