import type { PresetFilters } from "../hooks/usePresets";
import type { Preset } from "../hooks/usePresets";

interface Props {
  presets: Preset[];
  currentFilters: PresetFilters;
  onApply: (filters: PresetFilters) => void;
  onAdd: (name: string, filters: PresetFilters) => void;
  onRemove: (id: string) => void;
}

export function PresetBar({ presets, currentFilters, onApply, onAdd, onRemove }: Props) {
  function handleAdd() {
    const name = prompt("プリセット名を入力してください");
    if (!name || name.trim() === "") return;
    onAdd(name.trim(), currentFilters);
  }

  return (
    <div className="flex flex-wrap items-center gap-[var(--space-2)] mb-[var(--space-3)]">
      <button
        type="button"
        className="px-[var(--space-3)] py-[4px] bg-[var(--bg-elevated)] text-[var(--fg-muted)] border border-dashed border-[var(--border-subtle)] rounded-[var(--radius-full)] text-[var(--font-size-sm)] font-[inherit] cursor-pointer whitespace-nowrap transition-[border-color,color] duration-100 hover:border-[var(--accent)] hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
        onClick={handleAdd}
      >
        + 現在のフィルタを保存
      </button>
      {presets.map((preset) => (
        <span
          key={preset.id}
          className="inline-flex items-center bg-[var(--accent-soft)] border border-[var(--accent)] rounded-[var(--radius-full)] overflow-hidden"
        >
          <button
            type="button"
            className="px-[var(--space-3)] py-[4px] bg-transparent text-[var(--accent)] border-none text-[var(--font-size-sm)] font-[inherit] cursor-pointer whitespace-nowrap hover:underline"
            onClick={() => onApply(preset.filters)}
          >
            {preset.name}
          </button>
          <button
            type="button"
            className="px-[var(--space-2)] py-[4px] pl-[2px] bg-transparent text-[var(--accent)] border-none text-[var(--font-size-sm)] font-[inherit] cursor-pointer opacity-60 leading-none transition-opacity duration-100 hover:opacity-100"
            aria-label={`${preset.name} を削除`}
            onClick={() => onRemove(preset.id)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
