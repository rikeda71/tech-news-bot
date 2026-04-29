import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { ToastContext, useToastState } from "../../client/hooks/useToast";

const { ToastContainer } = await import("../../client/components/ToastContainer");

function makeWrapper(msg: string, kind: "info" | "success" | "error" = "info") {
  function Wrapper() {
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
  return Wrapper;
}

describe("ToastContainer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing when there are no toasts", () => {
    function EmptyWrapper() {
      const state = useToastState();
      return (
        <ToastContext.Provider value={state}>
          <ToastContainer />
        </ToastContext.Provider>
      );
    }
    const { container } = render(<EmptyWrapper />);
    // ToastContainer は toasts が空のとき null を返す
    expect(container.querySelector('[aria-label="通知"]')).toBeNull();
  });

  it("renders nothing when rendered outside Provider (ctx is undefined)", () => {
    const { container } = render(<ToastContainer />);
    expect(container.firstChild).toBeNull();
  });

  it("displays a toast when show is called", () => {
    const Wrapper = makeWrapper("こんにちは");
    render(<Wrapper />);
    act(() => {
      fireEvent.click(screen.getByTestId("trigger"));
    });
    expect(screen.getByText("こんにちは")).toBeTruthy();
  });

  it("renders the notification container with aria-label", () => {
    const Wrapper = makeWrapper("aria テスト");
    render(<Wrapper />);
    act(() => {
      fireEvent.click(screen.getByTestId("trigger"));
    });
    expect(screen.getByLabelText("通知")).toBeTruthy();
  });

  it("dismisses a toast when close button is clicked", () => {
    const Wrapper = makeWrapper("削除テスト");
    render(<Wrapper />);
    act(() => {
      fireEvent.click(screen.getByTestId("trigger"));
    });
    expect(screen.getByText("削除テスト")).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "閉じる" }));
    });
    expect(screen.queryByText("削除テスト")).toBeNull();
  });

  it("auto-dismisses toast after 4 seconds", () => {
    const Wrapper = makeWrapper("自動消去");
    render(<Wrapper />);
    act(() => {
      fireEvent.click(screen.getByTestId("trigger"));
    });
    expect(screen.getByText("自動消去")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(4001);
    });
    expect(screen.queryByText("自動消去")).toBeNull();
  });
});
