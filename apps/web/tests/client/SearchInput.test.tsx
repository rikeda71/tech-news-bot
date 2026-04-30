import { act, fireEvent, render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vite-plus/test";

const { SearchInput } = await import("../../client/components/SearchInput");

describe("SearchInput", () => {
  it("renders with the provided value", () => {
    render(<SearchInput value="React" onChange={vi.fn<(q: string) => void>()} />);
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    expect(input.value).toBe("React");
  });

  it("has placeholder text", () => {
    render(<SearchInput value="" onChange={vi.fn<(q: string) => void>()} />);
    expect(screen.getByPlaceholderText("記事を検索 (タイトル / 概要)")).toBeTruthy();
  });

  it("calls onChange with debounced value after delay", async () => {
    vi.useFakeTimers();
    try {
      const onChange = vi.fn<(q: string) => void>();
      render(<SearchInput value="" onChange={onChange} delayMs={300} />);
      const input = screen.getByRole("searchbox");
      // 直接 fireEvent で変更 (fake timers 環境で userEvent はタイムアウトするため)
      act(() => {
        fireEvent.change(input, { target: { value: "React" } });
      });
      // タイマーを進める前はまだ呼ばれていない
      expect(onChange).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(onChange).toHaveBeenCalledWith("React");
    } finally {
      vi.useRealTimers();
    }
  });

  it("calls onFocus when input is focused", async () => {
    const onFocus = vi.fn<() => void>();
    const user = userEvent.setup();
    render(<SearchInput value="" onChange={vi.fn<(q: string) => void>()} onFocus={onFocus} />);
    await user.click(screen.getByRole("searchbox"));
    expect(onFocus).toHaveBeenCalled();
  });

  it("calls onBlur when input loses focus", async () => {
    const onBlur = vi.fn<() => void>();
    const user = userEvent.setup();
    render(
      <div>
        <SearchInput value="" onChange={vi.fn<(q: string) => void>()} onBlur={onBlur} />
        <button type="button">outside</button>
      </div>,
    );
    await user.click(screen.getByRole("searchbox"));
    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(onBlur).toHaveBeenCalled();
  });

  it("forwards ref to the underlying input element", () => {
    const ref = createRef<HTMLInputElement>();
    render(<SearchInput value="test" onChange={vi.fn<(q: string) => void>()} ref={ref} />);
    expect(ref.current).toBeTruthy();
    expect.soft(ref.current?.tagName).toBe("INPUT");
    expect.soft(ref.current?.value).toBe("test");
  });

  it("has aria-label for screen readers", () => {
    render(<SearchInput value="" onChange={vi.fn<(q: string) => void>()} />);
    const input = screen.getByRole("searchbox");
    expect(input.getAttribute("aria-label")).toBe("記事を検索");
  });

  it("reflects suggestVisible in aria-expanded", () => {
    const { rerender } = render(
      <SearchInput value="" onChange={vi.fn<(q: string) => void>()} suggestVisible={false} />,
    );
    const input = screen.getByRole("searchbox");
    // React は aria-* 属性を boolean false でも "false" として DOM に残す
    expect(input.getAttribute("aria-expanded")).toBe("false");

    rerender(
      <SearchInput value="" onChange={vi.fn<(q: string) => void>()} suggestVisible={true} />,
    );
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });
});
