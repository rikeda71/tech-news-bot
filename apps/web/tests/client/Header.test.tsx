import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

// useTheme をモックして theme と toggleTheme を制御する
const mockToggleTheme = vi.fn<() => void>();
let mockTheme: "light" | "dark" = "light";

vi.mock("../../client/hooks/useTheme", () => ({
  useTheme: () => ({
    get theme() {
      return mockTheme;
    },
    toggleTheme: mockToggleTheme,
  }),
}));

const { Header } = await import("../../client/components/Header");

describe("Header", () => {
  it("renders the site name heading", () => {
    mockTheme = "light";
    render(<Header />);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });

  it("shows 'Switch to dark mode' aria-label when theme is light", () => {
    mockTheme = "light";
    render(<Header />);
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
  });

  it("shows 'Switch to light mode' aria-label when theme is dark", () => {
    mockTheme = "dark";
    render(<Header />);
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();
  });

  it("calls toggleTheme when the button is clicked", async () => {
    mockTheme = "light";
    mockToggleTheme.mockClear();
    const user = userEvent.setup();
    render(<Header />);
    await user.click(screen.getByRole("button", { name: "Switch to dark mode" }));
    expect(mockToggleTheme).toHaveBeenCalledTimes(1);
  });
});
