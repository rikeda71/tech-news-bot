import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ToastContainer } from "../../client/components/ToastContainer";
import { type ToastKind, ToastContext, useToastState } from "../../client/hooks/useToast";

// テスト用コンポーネント: ボタン押下で show を呼び出せるようにする
function ToastTestBed({ msg, kind }: { msg: string; kind?: ToastKind }) {
  const state = useToastState();
  return (
    <ToastContext.Provider value={state}>
      <button type="button" onClick={() => state.show(msg, kind)} data-testid="trigger">
        show
      </button>
      <ToastContainer />
    </ToastContext.Provider>
  );
}

describe("useToast / ToastContainer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("Provider 内で show を呼ぶと toast が DOM に表示される", () => {
    render(<ToastTestBed msg="テスト通知" kind="info" />);

    act(() => {
      fireEvent.click(screen.getByTestId("trigger"));
    });

    expect(screen.getByText("テスト通知")).toBeTruthy();
  });

  it("4 秒後にトーストが自動 dismiss される", () => {
    render(<ToastTestBed msg="自動削除通知" kind="info" />);

    act(() => {
      fireEvent.click(screen.getByTestId("trigger"));
    });

    expect(screen.getByText("自動削除通知")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(4001);
    });

    expect(screen.queryByText("自動削除通知")).toBeNull();
  });

  it("x ボタンクリックでトーストが dismiss される", () => {
    render(<ToastTestBed msg="手動削除通知" kind="success" />);

    act(() => {
      fireEvent.click(screen.getByTestId("trigger"));
    });

    expect(screen.getByText("手動削除通知")).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /閉じる/i }));
    });

    expect(screen.queryByText("手動削除通知")).toBeNull();
  });

  it("最大 3 件を超えると古いトーストが削除される", () => {
    function MultiShowBed() {
      const state = useToastState();
      return (
        <ToastContext.Provider value={state}>
          {(["通知1", "通知2", "通知3", "通知4"] as const).map((msg) => (
            <button
              key={msg}
              type="button"
              data-testid={msg}
              onClick={() => state.show(msg, "info")}
            >
              {msg}
            </button>
          ))}
          <ToastContainer />
        </ToastContext.Provider>
      );
    }

    render(<MultiShowBed />);

    act(() => {
      // 4 件連続で追加
      for (const msg of ["通知1", "通知2", "通知3", "通知4"]) {
        fireEvent.click(screen.getByTestId(msg));
      }
    });

    // role="status" を持つ Toast 要素のみで判定 (トリガーボタンは除外)
    const toasts = screen.getAllByRole("status");
    const msgs = toasts.map((el) => el.textContent ?? "");

    // 最新 3 件のみ残り、最古の「通知1」は消える
    expect.soft(msgs.some((m) => m.includes("通知1"))).toBe(false);
    expect.soft(msgs.some((m) => m.includes("通知2"))).toBe(true);
    expect.soft(msgs.some((m) => m.includes("通知3"))).toBe(true);
    expect.soft(msgs.some((m) => m.includes("通知4"))).toBe(true);
    expect.soft(toasts).toHaveLength(3);
  });

  it("toast 要素に aria-live='polite' と role='status' が設定されている", () => {
    render(<ToastTestBed msg="aria テスト" kind="error" />);

    act(() => {
      fireEvent.click(screen.getByTestId("trigger"));
    });

    const toastEl = screen.getByRole("status");
    expect.soft(toastEl).toBeTruthy();
    expect.soft(toastEl.getAttribute("aria-live")).toBe("polite");
  });
});
