---
paths:
  - "apps/web/tests/worker/**/*.ts"
  - "apps/web/tests/setup.ts"
  - "apps/web/vitest.config.ts"
---

# Worker テスト規約 (vitest + cloudflare/vitest-pool-workers)

## 配置

- `apps/web/tests/worker/<area>/<file>.test.ts`
- area の例:
  - `api/` … `/api/*` エンドポイントの integration テスト
  - `collector/` … RSS/Atom 取得・パース・retry・dedup
  - `db/` … D1 アクセス層 (articles / feeds / stats)
  - `notify/` … Slack 通知などサイドエフェクト
  - `cron/` … `scheduled` handler 統合
- 1 ファイル 1 テーマ。300 行を超えたら area を切り直す

## ランナー設定

`apps/web/vitest.config.ts` で:

- `cloudflareTest({ wrangler: { configPath: "./wrangler.toml" }, miniflare: { ... } })` プラグインで Workers ランタイム上で実行
- bindings: `TEST_MIGRATIONS` (root `migrations/` を `readD1Migrations` で読み込み)、`ADMIN_TOKEN: "test-admin-token"`、`COLLECTOR_TIMEOUT_MS: "500"` 等
- include: `tests/worker/**/*.test.ts` のみ。client は別 config

## D1 のリセット (重要)

- `apps/web/tests/setup.ts` が **各テスト前** に `reset()` + `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` を実行する
- したがって個別テストで `beforeEach` に `DELETE FROM ...` を書く必要はない
- seed が必要なら `beforeEach` で個別に INSERT する。共通 seed は `tests/fixtures/<name>.ts` に置き helper にする

## import 規約

```ts
import { describe, it, expect, beforeEach, vi } from "vite-plus/test";
import { env, SELF, applyD1Migrations } from "cloudflare:test";
```

- `vitest` から直接 import しない (vp 経由の vitest 4 系を使うため)
- `env` は `wrangler.toml` + miniflare で組み立てた `Env` 型 (D1 / vars / assets binding 入り)
- `SELF` は本 worker 自身の `fetch` ハンドラ。integration テストで使う:
  ```ts
  const res = await SELF.fetch("https://example.com/api/articles?limit=10");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.articles).toHaveLength(10);
  ```

## ユニットテスト (純関数)

- collector の parse / dedup / normalize のような純関数は、env なしで直接 import して呼ぶ
- 入力 / 期待出力を fixture (`tests/fixtures/rss/<feed>.xml`) に置き、`fs.readFileSync` で読む
- 副作用を持つ関数はモック化せず、`env.DB` を直接使って小さな状態を作って検証する (D1 は in-memory なので速い)

## API integration テスト (`SELF.fetch`)

- 対象 endpoint ごとに 1 ファイル: `tests/worker/api/articles.test.ts` 等
- 必要な seed を beforeEach で投入 → SELF.fetch でリクエスト → status / body を assert
- 認証必要な endpoint は `headers: { Authorization: "Bearer test-admin-token" }`
- レスポンス body の型は `as Foo` でキャストせず、検証時に `expect(body).toMatchObject({ ... })` で構造を assert

```ts
it("GET /api/articles returns paginated list", async () => {
  await env.DB.batch([
    env.DB.prepare("INSERT INTO articles (...) VALUES (?, ?, ?)").bind(...),
    // ...
  ]);
  const res = await SELF.fetch("https://x.test/api/articles?limit=2");
  expect(res.status).toBe(200);
  const body = await res.json<{ articles: Article[]; cursor: string | null }>();
  expect(body.articles).toHaveLength(2);
  expect(body.cursor).toBeTypeOf("string");
});
```

## collector テスト

- 外部 fetch は `vi.stubGlobal("fetch", vi.fn(async (url) => ...))` でスタブ。実際にネットに出ない
- timeout 検証は `COLLECTOR_TIMEOUT_MS=500` の環境で意図的に遅延させる Promise を返す mock fetch を作る
- retry のテストは call count + backoff 時間を assert (`vi.useFakeTimers()` で時間進める)

## scheduled (cron) テスト

- `SELF.scheduled({ scheduledTime: Date.now(), cron: "0 */3 * * *", type: "scheduled" })` で起動できる
- 副作用 (D1 INSERT) を直接 query で確認

## Mock の使い方 (古典派 = classical school)

本プロジェクトの worker テストは古典派 (`20-testing-overview.md` 参照)。**実物の D1 と実物の Hono Worker** で振る舞いを検証する。

### モックして OK

- **外部 `fetch`** (RSS / 外部 API): `vi.stubGlobal("fetch", vi.fn(...))` で境界スタブ
- **時刻**: `vi.useFakeTimers()` + `vi.setSystemTime(...)` (テスト後 `vi.useRealTimers()`)
- **`Math.random`**: `vi.spyOn(Math, "random").mockReturnValue(0.5)` (決定論が必要な場合のみ)

### モックしてはいけない

- 内部モジュール (`vi.mock("../db/articles")` のような import 全置換)
- D1 の repository (実 `env.DB` を使う)
- Hono の route handler (`SELF.fetch` で worker 全体を叩く)
- collector のパース関数 (純関数なら直接呼ぶ。fixture XML を `tests/fixtures/rss/` に置く)

`vi.mock` を書きたくなったら、その手前で設計を疑う:

- 関数が引数を増やしすぎていないか
- 外部依存が境界に集約されているか (collector の中で `fetch` を呼ぶのか、引数で `fetcher` を受けるのか)
- 1 ファイルに責務を詰め込みすぎていないか

### 後始末

- `vi.spyOn(...)` を使った場合は `afterEach(() => vi.restoreAllMocks())`
- `vi.stubGlobal(...)` を使った場合は `afterEach(() => vi.unstubAllGlobals())`
- `vi.useFakeTimers()` を使った場合は `afterEach(() => vi.useRealTimers())`

## 失敗時のデバッグ

- `console.log(await res.text())` でレスポンスを直接見る
- `env.DB.prepare("SELECT * FROM articles").all()` で D1 の状態を吐き出す
- vitest の `--ui` モード: `pnpm test:watch`
