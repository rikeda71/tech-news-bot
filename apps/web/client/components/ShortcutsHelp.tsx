interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: { key: string; label: string }[] = [
  { key: "j / ↓", label: "次の記事に移動" },
  { key: "k / ↑", label: "前の記事に移動" },
  { key: "Enter", label: "選択中の記事を新規タブで開く" },
  { key: "b", label: "選択中の記事をブックマーク切り替え" },
  { key: "/", label: "検索ボックスにフォーカス" },
  { key: "?", label: "このヘルプを開く / 閉じる" },
  { key: "g g", label: "先頭に戻る (500ms 以内に 2 回)" },
  { key: "G", label: "末尾に移動" },
  { key: "Esc", label: "ヘルプを閉じる / 選択解除" },
];

export function ShortcutsHelp({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="shortcuts-help-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="キーボードショートカット"
    >
      <div className="shortcuts-help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="shortcuts-help-header">
          <h2>キーボードショートカット</h2>
          <button
            type="button"
            className="shortcuts-help-close"
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <table className="shortcuts-help-table">
          <tbody>
            {SHORTCUTS.map(({ key, label }) => (
              <tr key={key}>
                <td>
                  <kbd>{key}</kbd>
                </td>
                <td>{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
