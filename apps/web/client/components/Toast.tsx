import type { Toast as ToastData } from "../hooks/useToast";

interface Props {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: Props) {
  return (
    <div
      className={`toast toast-${toast.kind}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="toast-msg">{toast.msg}</span>
      <button
        type="button"
        className="toast-close"
        aria-label="閉じる"
        onClick={() => onDismiss(toast.id)}
      >
        x
      </button>
    </div>
  );
}
