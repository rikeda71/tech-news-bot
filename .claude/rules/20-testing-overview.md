---
paths:
  - "apps/web/tests/**/*.ts"
  - "apps/web/tests/**/*.tsx"
  - "apps/web/e2e/**/*.ts"
  - "apps/web/vitest.config.ts"
  - "apps/web/vitest.client.config.ts"
  - "apps/web/playwright.config.ts"
---

# テスト規約 (共通)

## テストレイヤと責務

このプロジェクトでは 3 階層のテストを使い分ける:

| レイヤ                          | ランナー                                     | 配置                        | 目的                                          |
| ------------------------------- | -------------------------------------------- | --------------------------- | --------------------------------------------- |
| **worker (unit / integration)** | vitest 4 + `@cloudflare/vitest-pool-workers` | `apps/web/tests/worker/**`  | Worker ロジック・API・collector・D1 アクセス  |
| **client (unit)**               | vitest 4 + happy-dom + RTL                   | `apps/web/tests/client/**`  | React コンポーネント・カスタムフック          |
| **e2e**                         | Playwright (chromium)                        | `apps/web/e2e/**/*.spec.ts` | エンドユーザーから見た UI フロー (実ブラウザ) |

詳細は `21-testing-worker.md` / `22-testing-client.md` / `23-testing-e2e.md` 参照。

## いつどのテストを書くか

| 変更内容                              | 必須テスト                                                             |
| ------------------------------------- | ---------------------------------------------------------------------- |
| 新規 API endpoint                     | worker (integration via `SELF.fetch`)                                  |
| collector / D1 ヘルパーの新規ロジック | worker (unit)                                                          |
| 既存 API のレスポンス形変更           | worker (該当 endpoint テスト) + client 型修正                          |
| 新規 React コンポーネント / フック    | client (unit)                                                          |
| 主要 UI フロー (検索、カテゴリ切替等) | e2e (1 spec) — golden path のみ                                        |
| バグ修正                              | バグを再現するテストを **先に** 書いてから修正                         |
| feeds.yaml の追加 / 削除              | テスト不要 (yaml validation は CI で機械的に)                          |
| マイグレーション追加                  | `applyD1Migrations` で自動適用されるので、関連 query のテスト追加で OK |

## 起動コマンド

| 目的                  | コマンド                                        |
| --------------------- | ----------------------------------------------- |
| worker テスト全実行   | `pnpm test` (`apps/web/` で `vp test run`)      |
| client テスト全実行   | `pnpm test:client`                              |
| 全部                  | `pnpm test && pnpm test:client`                 |
| watch モード          | `pnpm test:watch` (`apps/web/`)                 |
| 特定ファイルのみ      | `vp test run tests/worker/api/articles.test.ts` |
| e2e 全実行            | `pnpm e2e`                                      |
| e2e UI モード (debug) | `pnpm --filter @tnb/web e2e:ui`                 |
| e2e レポート閲覧      | `pnpm --filter @tnb/web e2e:report`             |

CI では `vp check` (lint+format+typecheck) → `pnpm build` → `pnpm test` → `pnpm test:client` → `pnpm e2e` の順で実行される。

## テスト学派 (古典派 / classical school)

本プロジェクトは **古典学派 (classical / Detroit / Chicago school)** の方針を採る。**モックを極力使わず、実物の依存で振る舞いをテストする**。

| 観点                | 本プロジェクトの方針 (classical)                                      | 採らない方針 (London / mockist)                    |
| ------------------- | --------------------------------------------------------------------- | -------------------------------------------------- |
| D1                  | `env.DB` を実物として使う (miniflare の in-memory D1)                 | repository を mock                                 |
| Hono Worker         | `SELF.fetch()` で worker 全体を叩く                                   | route handler を抽出して unit でモック呼び出し     |
| DOM                 | happy-dom + RTL で実物の React レンダリング                           | shallow render / コンポーネントを mock             |
| 内部モジュール      | **mock しない**。実装を import して使う                               | 依存をすべて inject + mock                         |
| 外部 fetch (RSS 等) | `vi.stubGlobal("fetch", ...)` で **境界でのみ** スタブ                | —                                                  |
| 時刻 / Math.random  | `vi.setSystemTime` / `vi.spyOn(Math, "random")` で必要なときだけ固定  | —                                                  |
| 検証                | **状態 (state)** を assert: D1 の中身、画面に出るテキスト、レスポンス | **相互作用 (interaction)** を assert: 呼び出し回数 |

### 古典派を採る理由

- 内部モジュールを mock すると **リファクタ耐性が下がる** (実装変更で壊れる)。mock に書いた振る舞いが現実の実装と乖離していくとバグの温床になる
- D1 は miniflare で十分速く、現実に近い挙動 (制約違反、トランザクション) まで検証できる
- mockist 流に抽象化を強要されないので、コードがフラットに保てる

### モックを使ってよい例外

1. **外部ネットワーク fetch** (RSS フィード取得、Slack API): `vi.stubGlobal("fetch", ...)` で境界スタブ
2. **時刻 / 乱数**: 決定論を保つため `vi.setSystemTime` / `vi.spyOn`
3. **`console.error`** などの観測補助: 警告が出ることを検証したいケース

それ以外で `vi.mock("./module")` を書きたくなったら、まず設計を疑う。**モックが必要 = 結合度が高い** ことが多い。

## 共通の心得

- **新機能 / バグ修正は基本テストを追加してから PR を出す**。テスト追加が困難なケース (UI のごく些細な視覚変更等) は PR description にその旨を明記
- **assertion は具体的に**。`expect(result).toBeTruthy()` でなく `expect(result).toEqual({ status: "ok", saved: 3 })`
- **複数の独立した観点を検証する場合は soft assertion (`expect.soft(...)`) を使う**。1 つ目の失敗で fail-fast せず、すべての観点の失敗を 1 回の実行で集約できる:

  ```ts
  it("GET /api/articles returns paginated list", async () => {
    const res = await SELF.fetch("https://x.test/api/articles?limit=2");
    const body = await res.json<ArticlesResponse>();

    expect.soft(res.status).toBe(200);
    expect.soft(res.headers.get("Cache-Control")).toContain("max-age");
    expect.soft(body.articles).toHaveLength(2);
    expect.soft(body.next_cursor).toBeTypeOf("string");
  });
  ```

  - 「同じ対象の **独立した側面** (status / header / body の各キー)」を 1 テストでまとめて見る場合に有効
  - 一方、後続の assert が前の assert の前提に依存する (例: `body.articles[0]` を見るには `articles.length > 0` 必須) ケースは通常の `expect` を使い fail-fast させる
  - **assert を 5 件以上書くなら 1 テストとして肥大化していないか見直す**。観点が独立しすぎているなら `it` を分ける方が良い

- **テストの独立性**: 1 テストが他のテストに依存しない。順序を変えても通ること
- **flaky なテストは即修正**。retry でごまかさない (Playwright の `retries: 2` は CI 限定の保険)
- **import 規約**:
  - `vitest` の API は `vite-plus/test` から (`describe`, `it`, `expect`, `beforeEach`)。生 `vitest` を import しない
  - `cloudflare:test` から `env`, `SELF`, `applyD1Migrations`, `reset`
- **テスト前のビルド**: `pnpm test` を走らせる前に `pnpm build` を 1 回 (vitest-pool-workers が `apps/web/dist/client` を要求するため)。CI では自動化済み
- **時刻の固定**: 時刻依存のテストは `vi.setSystemTime(new Date("2026-04-29T00:00:00Z"))` で固定。テスト間で `vi.useRealTimers()` に戻す
