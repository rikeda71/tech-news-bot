import { createContext, useCallback, useContext, useId, useRef, useState } from "react";

export type ToastKind = "info" | "success" | "error";

export interface Toast {
  id: string;
  msg: string;
  kind: ToastKind;
}

interface ToastContextValue {
  toasts: Toast[];
  show: (msg: string, kind?: ToastKind) => void;
  dismiss: (id: string) => void;
}

const MAX_TOASTS = 3;
const DISMISS_MS = 4000;

export const ToastContext = createContext<ToastContextValue | undefined>(undefined);

/**
 * ToastProvider の外 (Provider なし環境) から呼ばれた場合は no-op を返す。
 * Provider 内では実際のトースト操作を提供する。
 */
export function useToast(): { show: (msg: string, kind?: ToastKind) => void } {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Provider なし環境では何もしない
    return { show: () => {} };
  }
  return { show: ctx.show };
}

// Context 値をそのまま取得したい内部コンポーネント向け
export function useToastContext(): ToastContextValue | undefined {
  return useContext(ToastContext);
}

// Provider 実装は ToastContainer / App 側で行うため、
// ここでは Context と hook のみを export する。
// 状態管理の実体は useToastState() として切り出す。
export function useToastState(): ToastContextValue {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // useId はサーバーサイドでも安全な id 生成。ブラウザ環境なので Date.now() prefix で衝突回避。
  const baseId = useId();
  // useRef で counter を管理することで useCallback の deps に含める必要をなくす
  const counterRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (msg: string, kind: ToastKind = "info") => {
      const id = `${baseId}-${Date.now()}-${counterRef.current++}`;
      setToasts((prev) => {
        const next = [...prev, { id, msg, kind }];
        // 最大件数を超えたら古いものから削除
        return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
      });
      // 4 秒後に自動 dismiss
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, DISMISS_MS);
    },
    [baseId],
  );

  return { toasts, show, dismiss };
}
