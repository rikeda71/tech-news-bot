import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

// useTheme をモックして theme と setTheme を制御する
const mockSetTheme = vi.fn<(t: "light" | "dark" | "system") => void>();
let mockTheme: "light" | "dark" | "system" = "system";

vi.mock("../../client/hooks/useTheme", () => ({
  useTheme: () => ({
    get theme() {
      return mockTheme;
    },
    setTheme: mockSetTheme,
    resolvedTheme: mockTheme === "system" ? "light" : mockTheme,
  }),
}));

const { Header } = await import("../../client/components/Header");

describe("Header", () => {
  beforeEach(() => {
    mockTheme = "system";
    mockSetTheme.mockClear();
  });

  it("renders the site name heading", () => {
    render(<Header />);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("renders 3 theme toggle buttons", () => {
    render(<Header />);
    expect(screen.getByRole("button", { name: "ライトモード" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "OS設定に追従" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "ダークモード" })).toBeTruthy();
  });

  it("system button is aria-pressed=true when theme is system", () => {
    mockTheme = "system";
    render(<Header />);
    const btn = screen.getByRole("button", { name: "OS設定に追従" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("light button is aria-pressed=true when theme is light", () => {
    mockTheme = "light";
    render(<Header />);
    const btn = screen.getByRole("button", { name: "ライトモード" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("dark button is aria-pressed=true when theme is dark", () => {
    mockTheme = "dark";
    render(<Header />);
    const btn = screen.getByRole("button", { name: "ダークモード" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("calls setTheme('light') when light button is clicked", async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole("button", { name: "ライトモード" }));
    expect(mockSetTheme).toHaveBeenCalledWith("light");
  });

  it("calls setTheme('dark') when dark button is clicked", async () => {
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole("button", { name: "ダークモード" }));
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("calls setTheme('system') when system button is clicked", async () => {
    mockTheme = "light";
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole("button", { name: "OS設定に追従" }));
    expect(mockSetTheme).toHaveBeenCalledWith("system");
  });
});
