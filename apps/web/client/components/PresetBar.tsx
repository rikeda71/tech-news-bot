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
    <div className="preset-bar">
      <button type="button" className="preset-add" onClick={handleAdd}>
        + 現在のフィルタを保存
      </button>
      {presets.map((preset) => (
        <span key={preset.id} className="preset-pill">
          <button
            type="button"
            className="preset-pill-name"
            onClick={() => onApply(preset.filters)}
          >
            {preset.name}
          </button>
          <button
            type="button"
            className="preset-pill-remove"
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
