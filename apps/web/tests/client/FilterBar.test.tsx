import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { FilterBar } from "../../client/components/FilterBar";

const defaultProps = {
  category: "" as const,
  lang: "" as const,
  feedId: "",
  feeds: [],
  dateFrom: "",
  dateTo: "",
  unreadOnly: false,
  starredOnly: false,
  onCategoryChange: vi.fn<(c: string) => void>(),
  onLangChange: vi.fn<(l: string) => void>(),
  onFeedChange: vi.fn<(id: string) => void>(),
  onDateFromChange: vi.fn<(v: string) => void>(),
  onDateToChange: vi.fn<(v: string) => void>(),
  onUnreadOnlyChange: vi.fn<(v: boolean) => void>(),
  onStarredOnlyChange: vi.fn<(v: boolean) => void>(),
  onClear: vi.fn<() => void>(),
};

describe("FilterBar", () => {
  it("renders category select with default option", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.getByText("All categories")).toBeTruthy();
  });

  it("calls onCategoryChange when a category is selected", async () => {
    const onCategoryChange = vi.fn<(c: string) => void>();
    const user = userEvent.setup();
    render(<FilterBar {...defaultProps} onCategoryChange={onCategoryChange} />);
    await user.selectOptions(screen.getAllByRole("combobox")[0], "ai");
    expect(onCategoryChange).toHaveBeenCalledWith("ai");
  });

  it("calls onLangChange when a language is selected", async () => {
    const onLangChange = vi.fn<(l: string) => void>();
    const user = userEvent.setup();
    render(<FilterBar {...defaultProps} onLangChange={onLangChange} />);
    await user.selectOptions(screen.getAllByRole("combobox")[1], "ja");
    expect(onLangChange).toHaveBeenCalledWith("ja");
  });

  it("does not show clear button when no filters are active", () => {
    render(<FilterBar {...defaultProps} />);
    expect(screen.queryByText(/解除/)).toBeNull();
  });

  it("shows clear button when a filter is active and calls onClear on click", async () => {
    const onClear = vi.fn<() => void>();
    const user = userEvent.setup();
    render(<FilterBar {...defaultProps} category="ai" onClear={onClear} />);
    const clearBtn = screen.getByText(/解除/);
    expect(clearBtn).toBeTruthy();
    await user.click(clearBtn);
    expect(onClear).toHaveBeenCalled();
  });
});
