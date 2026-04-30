import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { ThemeToggle } = await import("../../client/components/ThemeToggle");

describe("ThemeToggle", () => {
  const mockSetTheme = vi.fn<(t: "light" | "dark" | "system") => void>();

  beforeEach(() => {
    mockSetTheme.mockClear();
  });

  it("renders 3 buttons (light, system, dark)", () => {
    render(<ThemeToggle theme="system" onSetTheme={mockSetTheme} />);
    expect.soft(screen.getByRole("button", { name: "ライトモード" })).toBeTruthy();
    expect.soft(screen.getByRole("button", { name: "OS設定に追従" })).toBeTruthy();
    expect.soft(screen.getByRole("button", { name: "ダークモード" })).toBeTruthy();
  });

  it("light button has aria-pressed=true when theme is light", () => {
    render(<ThemeToggle theme="light" onSetTheme={mockSetTheme} />);
    expect
      .soft(screen.getByRole("button", { name: "ライトモード" }).getAttribute("aria-pressed"))
      .toBe("true");
    expect
      .soft(screen.getByRole("button", { name: "OS設定に追従" }).getAttribute("aria-pressed"))
      .toBe("false");
    expect
      .soft(screen.getByRole("button", { name: "ダークモード" }).getAttribute("aria-pressed"))
      .toBe("false");
  });

  it("system button has aria-pressed=true when theme is system", () => {
    render(<ThemeToggle theme="system" onSetTheme={mockSetTheme} />);
    expect(screen.getByRole("button", { name: "OS設定に追従" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("dark button has aria-pressed=true when theme is dark", () => {
    render(<ThemeToggle theme="dark" onSetTheme={mockSetTheme} />);
    expect(screen.getByRole("button", { name: "ダークモード" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("calls onSetTheme('light') when light button is clicked", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle theme="system" onSetTheme={mockSetTheme} />);
    await user.click(screen.getByRole("button", { name: "ライトモード" }));
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  it("calls onSetTheme('system') when system button is clicked", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle theme="dark" onSetTheme={mockSetTheme} />);
    await user.click(screen.getByRole("button", { name: "OS設定に追従" }));
    expect(mockSetTheme).toHaveBeenCalledWith("system");
  });

  it("calls onSetTheme('dark') when dark button is clicked", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle theme="light" onSetTheme={mockSetTheme} />);
    await user.click(screen.getByRole("button", { name: "ダークモード" }));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("has role=group with aria-label", () => {
    render(<ThemeToggle theme="system" onSetTheme={mockSetTheme} />);
    expect(screen.getByRole("group", { name: "テーマ切替" })).toBeTruthy();
  });
});
