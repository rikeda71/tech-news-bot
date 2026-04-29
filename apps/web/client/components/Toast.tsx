import type { Toast as ToastData } from "../hooks/useToast";

interface Props {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

// kind に応じたボーダー色。success / error のみ特殊色、それ以外は subtle
function kindBorderClass(kind: ToastData["kind"]) {
  if (kind === "success") return "border-[var(--success)]";
  if (kind === "error") return "border-[var(--danger)]";
  return "border-[var(--border-subtle)]";
}

function kindMsgClass(kind: ToastData["kind"]) {
  if (kind === "success") return "text-[var(--success)]";
  if (kind === "error") return "text-[var(--danger)]";
  return "text-[var(--fg-primary)]";
}

export function Toast({ toast, onDismiss }: Props) {
  return (
    <div
      className={`flex items-center gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-3)] bg-[var(--bg-elevated)] border rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] text-[var(--font-size-base)] min-w-[220px] max-w-[360px] pointer-events-auto animate-toast-in ${kindBorderClass(toast.kind)}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className={`flex-1 ${kindMsgClass(toast.kind)}`}>{toast.msg}</span>
      <button
        type="button"
        className="shrink-0 bg-transparent border-none text-[var(--fg-muted)] text-[var(--font-size-sm)] font-[inherit] cursor-pointer p-0 px-[2px] leading-none opacity-70 transition-opacity duration-100 hover:opacity-100 hover:text-[var(--fg-primary)]"
        aria-label="閉じる"
        onClick={() => onDismiss(toast.id)}
      >
        x
      </button>
    </div>
  );
}
