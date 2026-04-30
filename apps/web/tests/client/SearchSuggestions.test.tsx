import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

const { SearchSuggestions } = await import("../../client/components/SearchSuggestions");

const items = ["React", "TypeScript", "Cloudflare"];

describe("SearchSuggestions", () => {
  it("renders nothing when visible=false", () => {
    const { container } = render(
      <SearchSuggestions
        items={items}
        onPick={vi.fn<(q: string) => void>()}
        onRemove={vi.fn<(q: string) => void>()}
        onClearAll={vi.fn<() => void>()}
        visible={false}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when items is empty even if visible=true", () => {
    const { container } = render(
      <SearchSuggestions
        items={[]}
        onPick={vi.fn<(q: string) => void>()}
        onRemove={vi.fn<(q: string) => void>()}
        onClearAll={vi.fn<() => void>()}
        visible={true}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders suggestion items when visible=true and items is non-empty", () => {
    render(
      <SearchSuggestions
        items={items}
        onPick={vi.fn<(q: string) => void>()}
        onRemove={vi.fn<(q: string) => void>()}
        onClearAll={vi.fn<() => void>()}
        visible={true}
      />,
    );
    expect.soft(screen.getByText("React")).toBeTruthy();
    expect.soft(screen.getByText("TypeScript")).toBeTruthy();
    expect.soft(screen.getByText("Cloudflare")).toBeTruthy();
  });

  it("calls onPick when a suggestion item is clicked via mousedown", () => {
    const onPick = vi.fn<(q: string) => void>();
    render(
      <SearchSuggestions
        items={items}
        onPick={onPick}
        onRemove={vi.fn<(q: string) => void>()}
        onClearAll={vi.fn<() => void>()}
        visible={true}
      />,
    );
    // SearchSuggestions は onMouseDown を使っているため fireEvent.mouseDown を使う
    fireEvent.mouseDown(screen.getByText("React"));
    expect(onPick).toHaveBeenCalledWith("React");
  });

  it("calls onRemove when delete button is clicked via mousedown", () => {
    const onRemove = vi.fn<(q: string) => void>();
    render(
      <SearchSuggestions
        items={items}
        onPick={vi.fn<(q: string) => void>()}
        onRemove={onRemove}
        onClearAll={vi.fn<() => void>()}
        visible={true}
      />,
    );
    fireEvent.mouseDown(screen.getByRole("button", { name: `"React" を履歴から削除` }));
    expect(onRemove).toHaveBeenCalledWith("React");
  });

  it("calls onClearAll when clear all button is clicked via mousedown", () => {
    const onClearAll = vi.fn<() => void>();
    render(
      <SearchSuggestions
        items={items}
        onPick={vi.fn<(q: string) => void>()}
        onRemove={vi.fn<(q: string) => void>()}
        onClearAll={onClearAll}
        visible={true}
      />,
    );
    fireEvent.mouseDown(screen.getByText("履歴をすべて削除"));
    expect(onClearAll).toHaveBeenCalled();
  });

  it("renders with listbox role", () => {
    render(
      <SearchSuggestions
        items={items}
        onPick={vi.fn<(q: string) => void>()}
        onRemove={vi.fn<(q: string) => void>()}
        onClearAll={vi.fn<() => void>()}
        visible={true}
      />,
    );
    expect(screen.getByRole("listbox")).toBeTruthy();
  });
});
