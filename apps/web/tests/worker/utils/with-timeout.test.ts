import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { withTimeout } from "../../../worker/utils/with-timeout";

afterEach(() => {
  vi.useRealTimers();
});

describe("withTimeout", () => {
  it("resolve fn の値をそのまま返す", async () => {
    const result = await withTimeout(async () => "ok", 1000);
    expect(result).toBe("ok");
  });

  it("fn に AbortSignal を渡す", async () => {
    let received: AbortSignal | null = null;
    await withTimeout(async (signal) => {
      received = signal;
      return 1;
    }, 1000);

    // guard: signal が渡っていないと後続の assert が無意味になる
    expect(received).not.toBeNull();
    expect.soft(received).toBeInstanceOf(AbortSignal);
    expect.soft((received as AbortSignal | null)?.aborted).toBe(false);
  });

  it("timeout 経過で AbortError を throw する", async () => {
    vi.useFakeTimers();

    const promise = withTimeout(
      // 永久に解決しない fn (signal を無視するケース)
      () => new Promise<string>(() => {}),
      100,
    );
    // unhandled rejection を避けるため即時に catch を attach
    const caught = promise.catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(150);
    const err = await caught;

    expect(err).toBeInstanceOf(DOMException);
    expect.soft((err as DOMException).name).toBe("AbortError");
  });

  it("timeout 時に fn の signal も abort される (signal を観測する fn の場合)", async () => {
    vi.useFakeTimers();

    let observed: AbortSignal | null = null;
    const promise = withTimeout((signal) => {
      observed = signal;
      return new Promise<string>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("fn-aborted")));
      });
    }, 100);
    const caught = promise.catch((e: unknown) => e);

    await vi.advanceTimersByTimeAsync(150);
    await caught;

    // 注: race の勝者は abortPromise (DOMException) または fn の reject (Error) のどちらでも良い。
    // 重要なのは fn 側が abort を受け取れていること。
    expect(observed).not.toBeNull();
    expect((observed as AbortSignal | null)?.aborted).toBe(true);
  });

  it("fn が reject したらその error を伝播する (timeout 前)", async () => {
    const err = await withTimeout(async () => {
      throw new Error("inner");
    }, 1000).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("inner");
  });

  it("fn が成功してもタイマーがリークしない (即座に解決後、setTimeout が走らない)", async () => {
    vi.useFakeTimers();

    let timeoutFired = false;
    // setTimeout を spy して、withTimeout 内のタイマーが clear されたか観測
    const realSetTimeout = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((
      fn: () => void,
      ms: number,
    ) => {
      const id = realSetTimeout(() => {
        timeoutFired = true;
        fn();
      }, ms) as unknown as number;
      return id;
    }) as typeof globalThis.setTimeout);

    await withTimeout(async () => "done", 1000);

    // fn が即時 resolve して、timer が clearTimeout されているはずなので advance しても fire しない
    await vi.advanceTimersByTimeAsync(2000);
    expect(timeoutFired).toBe(false);

    spy.mockRestore();
  });
});
