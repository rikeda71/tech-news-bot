import { useToastContext } from "../hooks/useToast";
import { Toast } from "./Toast";

export function ToastContainer() {
  const ctx = useToastContext();
  if (!ctx || ctx.toasts.length === 0) return null;

  return (
    <div
      className="fixed top-[calc(var(--header-height)+var(--space-3))] right-[var(--space-4)] z-[200] flex flex-col gap-[var(--space-2)] pointer-events-none"
      aria-label="通知"
    >
      {ctx.toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={ctx.dismiss} />
      ))}
    </div>
  );
}
