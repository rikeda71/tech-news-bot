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
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] backdrop-blur-[4px] [-webkit-backdrop-filter:blur(4px)]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="キーボードショートカット"
    >
      <div
        className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[var(--radius-xl)] px-[var(--space-6)] py-[var(--space-5)] min-w-[320px] max-w-[480px] w-[90%] shadow-[var(--shadow-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-[var(--space-4)]">
          <h2 className="m-0 text-[var(--font-size-md)] font-semibold">キーボードショートカット</h2>
          <button
            type="button"
            className="bg-transparent border-none text-[var(--fg-muted)] text-[1rem] cursor-pointer px-[var(--space-2)] py-[2px] rounded-[var(--radius-sm)] transition-[color,background] duration-100 hover:text-[var(--fg-primary)] hover:bg-[var(--bg-overlay)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2"
            onClick={onClose}
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <table className="border-collapse w-full text-[var(--font-size-base)]">
          <tbody>
            {SHORTCUTS.map(({ key, label }) => (
              <tr key={key}>
                <td className="py-[5px] px-[var(--space-2)] align-middle w-[40%] whitespace-nowrap">
                  <kbd>{key}</kbd>
                </td>
                <td className="py-[5px] px-[var(--space-2)] align-middle">{label}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
