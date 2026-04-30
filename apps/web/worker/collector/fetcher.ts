// backoff: 500ms, 1000ms の 2 回まで。並列度 4 × max 1.5s = 6s < 30s cron 制限
const BACKOFF_BASE_MS = 500;
const MAX_FEED_BYTES = 4 * 1024 * 1024; // 4MB

// 一部のブログ (mercari-engineering 等) は WAF が "bot" 名を含む UA を 403 で弾くため、
// Mozilla 互換プレフィックスを付ける。Feedly / NewsBlur など主要 RSS リーダも同様の手法。
const USER_AGENT =
  "Mozilla/5.0 (compatible; tech-news-bot/0.1; +https://github.com/rikeda71/tech-news-bot)";

/** fetchFeedOnce の戻り値。304 の場合は xml が null になる。 */
export interface FetchFeedResult {
  xml: string | null;
  etag: string | null;
  lastModified: string | null;
  notModified: boolean;
}

/** 一時障害とみなしてリトライすべき HTTP ステータスかどうか */
function isTransientStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/**
 * リトライ対象かどうかを判定する。
 * - AbortError: タイムアウト
 * - TypeError: ネットワーク接続失敗 ("Failed to fetch" 等)
 * - HTTP 5xx / 429: 一時的なサーバー障害
 * - HTTP 4xx (429 除く): 恒久エラーのためリトライしない
 * テスト用に export する
 */
export function isRetryableError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  if (err instanceof TypeError) return true;
  const m = /^HTTP (\d+)/.exec(err.message);
  if (m) return isTransientStatus(Number(m[1]));
  // HTTP エラー以外の予期しないエラーはリトライしない
  return false;
}

/**
 * 1 回の HTTP fetch を試みる。失敗時は呼び出し元でリトライを判断する。
 * - 4xx (429 除く) は恒久エラーなので Error をそのまま throw
 * - 5xx / 429 / AbortError / ネットワークエラーは throw して呼び出し元がリトライ
 * - 304 Not Modified は notModified=true で返す (リトライしない)
 */
async function fetchFeedOnce(
  url: string,
  timeoutMs: number,
  conditionalHeaders: { etag: string | null; lastModified: string | null },
): Promise<FetchFeedResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const reqHeaders: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "application/atom+xml, application/rss+xml, application/xml;q=0.9, */*;q=0.5",
    };
    if (conditionalHeaders.etag) {
      reqHeaders["if-none-match"] = conditionalHeaders.etag;
    }
    if (conditionalHeaders.lastModified) {
      reqHeaders["if-modified-since"] = conditionalHeaders.lastModified;
    }

    const res = await fetch(url, {
      headers: reqHeaders,
      signal: controller.signal,
      redirect: "follow",
    });

    // 304: サーバが変更なしと判断。parse/insert をスキップする。
    if (res.status === 304) {
      return { xml: null, etag: null, lastModified: null, notModified: true };
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    const contentLength = Number(res.headers.get("content-length") ?? 0);
    if (contentLength > MAX_FEED_BYTES) {
      throw new Error(`Feed too large: ${contentLength} bytes`);
    }
    const text = await res.text();
    if (text.length > MAX_FEED_BYTES) {
      throw new Error(`Feed body too large: ${text.length} bytes`);
    }

    return {
      xml: text,
      etag: res.headers.get("etag"),
      lastModified: res.headers.get("last-modified"),
      notModified: false,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 一時障害 (5xx / 429 / AbortError / ネットワークエラー) に対して
 * 指数バックオフ + jitter でリトライする。4xx / 304 は即 return。
 * sleep は wallclock のみ消費するため Worker の CPU 制限に影響しない。
 * テスト用に export する
 */
export async function fetchFeed(
  url: string,
  timeoutMs: number,
  maxRetries: number,
  conditionalHeaders: { etag: string | null; lastModified: string | null } = {
    etag: null,
    lastModified: null,
  },
): Promise<FetchFeedResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchFeedOnce(url, timeoutMs, conditionalHeaders);
    } catch (err) {
      lastError = err;

      const isRetryable = isRetryableError(err);

      if (!isRetryable || attempt >= maxRetries) break;

      // base * 2^attempt + jitter(0..base)
      const delayMs = BACKOFF_BASE_MS * 2 ** attempt + Math.random() * BACKOFF_BASE_MS;
      console.warn(
        `[collector] fetchFeed attempt ${attempt + 1} failed for ${url}: ${err instanceof Error ? err.message : String(err)}. Retrying in ${Math.round(delayMs)}ms`,
      );
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
