import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import type { Preset, PresetFilters } from "../../client/hooks/usePresets";

const { PresetBar } = await import("../../client/components/PresetBar");

const defaultFilters: PresetFilters = { category: "ai", lang: "en" };

const preset1: Preset = {
  id: "preset-1",
  name: "AI English",
  filters: defaultFilters,
};

const preset2: Preset = {
  id: "preset-2",
  name: "JP Tech",
  filters: { category: "jp", lang: "ja" },
};

describe("PresetBar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the add button", () => {
    render(
      <PresetBar
        presets={[]}
        currentFilters={defaultFilters}
        onApply={vi.fn<(f: PresetFilters) => void>()}
        onAdd={vi.fn<(name: string, filters: PresetFilters) => void>()}
        onRemove={vi.fn<(id: string) => void>()}
      />,
    );
    expect(screen.getByText("+ 現在のフィルタを保存")).toBeTruthy();
  });

  it("renders preset names when presets are provided", () => {
    render(
      <PresetBar
        presets={[preset1, preset2]}
        currentFilters={defaultFilters}
        onApply={vi.fn<(f: PresetFilters) => void>()}
        onAdd={vi.fn<(name: string, filters: PresetFilters) => void>()}
        onRemove={vi.fn<(id: string) => void>()}
      />,
    );
    expect(screen.getByText("AI English")).toBeTruthy();
    expect(screen.getByText("JP Tech")).toBeTruthy();
  });

  it("calls onApply with preset filters when preset button is clicked", async () => {
    const onApply = vi.fn<(f: PresetFilters) => void>();
    const user = userEvent.setup();
    render(
      <PresetBar
        presets={[preset1]}
        currentFilters={defaultFilters}
        onApply={onApply}
        onAdd={vi.fn<(name: string, filters: PresetFilters) => void>()}
        onRemove={vi.fn<(id: string) => void>()}
      />,
    );
    await user.click(screen.getByText("AI English"));
    expect(onApply).toHaveBeenCalledWith(preset1.filters);
  });

  it("calls onRemove with preset id when delete button is clicked", async () => {
    const onRemove = vi.fn<(id: string) => void>();
    const user = userEvent.setup();
    render(
      <PresetBar
        presets={[preset1]}
        currentFilters={defaultFilters}
        onApply={vi.fn<(f: PresetFilters) => void>()}
        onAdd={vi.fn<(name: string, filters: PresetFilters) => void>()}
        onRemove={onRemove}
      />,
    );
    await user.click(screen.getByRole("button", { name: `${preset1.name} を削除` }));
    expect(onRemove).toHaveBeenCalledWith(preset1.id);
  });

  it("calls onAdd with name from prompt when add button is clicked", async () => {
    const onAdd = vi.fn<(name: string, filters: PresetFilters) => void>();
    const user = userEvent.setup();
    vi.stubGlobal("prompt", vi.fn<() => string>().mockReturnValue("My Preset"));
    render(
      <PresetBar
        presets={[]}
        currentFilters={defaultFilters}
        onApply={vi.fn<(f: PresetFilters) => void>()}
        onAdd={onAdd}
        onRemove={vi.fn<(id: string) => void>()}
      />,
    );
    await user.click(screen.getByText("+ 現在のフィルタを保存"));
    expect(onAdd).toHaveBeenCalledWith("My Preset", defaultFilters);
    vi.unstubAllGlobals();
  });

  it("does not call onAdd when prompt returns empty string", async () => {
    const onAdd = vi.fn<(name: string, filters: PresetFilters) => void>();
    const user = userEvent.setup();
    vi.stubGlobal("prompt", vi.fn<() => string>().mockReturnValue("  "));
    render(
      <PresetBar
        presets={[]}
        currentFilters={defaultFilters}
        onApply={vi.fn<(f: PresetFilters) => void>()}
        onAdd={onAdd}
        onRemove={vi.fn<(id: string) => void>()}
      />,
    );
    await user.click(screen.getByText("+ 現在のフィルタを保存"));
    expect(onAdd).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
