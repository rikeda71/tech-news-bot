import { useToastContext } from "../hooks/useToast";
import { Toast } from "./Toast";

export function ToastContainer() {
  const ctx = useToastContext();
  if (!ctx || ctx.toasts.length === 0) return null;

  return (
    <div className="toast-container" aria-label="通知">
      {ctx.toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={ctx.dismiss} />
      ))}
    </div>
  );
}
