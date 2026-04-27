interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: { key: string; label: string }[] = [
  { key: "j / ↓", label: "次の記事に移動" },
  { key: "k / ↑", label: "前の記事に移動" },
  { key: "o / Enter", label: "フォーカス中の記事を別タブで開く" },
  { key: "m", label: "既読 / 未読をトグル" },
  { key: "/", label: "検索ボックスにフォーカス" },
  { key: "r", label: "フィルタをすべてクリア" },
  { key: "?", label: "このヘルプを開く / 閉じる" },
  { key: "Esc", label: "ヘルプを閉じる / 検索ボックスから離れる" },
];

export function HelpModal({ open, onClose }: Props) {
  if (!open) return null;

  return (
    <div
      className="help-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal
      aria-label="キーボードショートカット"
    >
      <div className="help-modal" onClick={(e) => e.stopPropagation()}>
        <div className="help-modal-header">
          <h2>キーボードショートカット</h2>
          <button type="button" className="help-close" onClick={onClose} aria-label="閉じる">
            ✕
          </button>
        </div>
        <table className="help-table">
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
