/**
 * Promise を timeout 付きで実行する。timeout 時は AbortController.signal を fn に渡し、
 * 自前で abort してリソース解放させる。fn が signal を使わない場合でも timeout で reject する。
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const ctrl = new AbortController();

  // fn が signal を使う (fetch 等) 場合は signal 経由でキャンセルされる。
  // fn が signal を無視する場合でも abortPromise が reject して timeout を強制する。
  const abortPromise = new Promise<never>((_, reject) => {
    ctrl.signal.addEventListener("abort", () =>
      reject(new DOMException("The operation was aborted", "AbortError")),
    );
  });

  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await Promise.race([fn(ctrl.signal), abortPromise]);
  } finally {
    clearTimeout(timer);
  }
}
