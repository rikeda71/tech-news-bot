---
paths:
  - "apps/web/e2e/**/*.spec.ts"
  - "apps/web/e2e/fixtures/**"
  - "apps/web/playwright.config.ts"
---

# E2E テスト規約 (Playwright)

## 配置

- `apps/web/e2e/<area>/<feature>.spec.ts`
- area 例:
  - `smoke/` … 起動 / 主要画面表示などの煙テスト
  - `pages/` … 各ページ (categories, stats, ...) の主要 flow
  - `filter/` … 検索・カテゴリ・bookmark フィルタ
  - `pagination/` … 無限スクロール / load more
  - `keyboard/` … キーボードショートカット
- ファイル 1 つにつき 1 つの主要シナリオ群。長くなりすぎたら area を切り直す
- fixtures: `apps/web/e2e/fixtures/seed.sql` で初期データを D1 (`.wrangler/state`) に投入

## 設定

`apps/web/playwright.config.ts`:

- `testDir: "./e2e"`
- `timeout: 30_000` (1 spec 上限)
- `retries: process.env.CI ? 2 : 0` (CI のみ retry)
- `reporter: ["list", "html"]`
- webServer: migrate → seed → `pnpm dev --port 5173` を順に実行
- baseURL: `http://localhost:5173`
- projects: chromium のみ (firefox / webkit は不要)

## 起動

| コマンド                            | 用途                                  |
| ----------------------------------- | ------------------------------------- |
| `pnpm e2e`                          | 全 spec 実行 (CI と同じ)              |
| `pnpm --filter @tnb/web e2e:ui`     | UI モード (デバッグ・spec の選択実行) |
| `pnpm --filter @tnb/web e2e:report` | 直近の HTML レポートを開く            |

## 書き方

- `import { test, expect } from "@playwright/test"`
- `test.describe(...)` でシナリオをグループ化
- セレクタは Playwright の locator API:
  1. `page.getByRole("button", { name: "保存" })`
  2. `page.getByLabel("メールアドレス")`
  3. `page.getByText(/エラー/)`
  4. `page.getByTestId("foo")` ← 最終手段
- assertion は `expect(locator).toBeVisible()` / `toHaveText(...)` / `toHaveAttribute(...)`。`auto-retry` がついているので flaky を抑えやすい

```ts
import { expect, test } from "@playwright/test";

test.describe("article filter", () => {
  test("カテゴリ ai を選ぶと URL に ?category=ai が付く", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "AI" }).click();
    await expect(page).toHaveURL(/category=ai/);
    await expect(page.getByRole("article").first()).toBeVisible();
  });
});
```

## 待機 / 同期

- `page.waitForTimeout(...)` は **使わない**。flaky の温床
- 代わりに locator ベースの auto-wait: `await expect(locator).toBeVisible()`
- ネットワーク待ちは `page.waitForResponse(/\/api\/articles/)` または `page.waitForLoadState("networkidle")`
- ナビゲーションは `await page.goto(...)` が自動で load を待つ。`waitForNavigation` を別途呼ばない

## fixtures (D1 seed)

- 共通の seed: `e2e/fixtures/seed.sql` (記事 / feeds の最低限のレコード)
- spec ごとに状態を変えたい場合は、worker API を直接叩いて投入する route を用意する (`POST /api/admin/seed` 等) — または Playwright の `test.beforeEach` で wrangler コマンドを実行
- DB の状態を spec 間で持ち越したくない場合は `test.beforeAll` で再 seed

## 認証

- `/api/admin/*` を E2E から叩く場合は `Authorization: Bearer test-admin-token` を `extraHTTPHeaders` で:

```ts
test.use({
  extraHTTPHeaders: {
    Authorization: "Bearer test-admin-token",
  },
});
```

## デバッグ

- `--debug` フラグで Playwright Inspector が開く
- `await page.pause()` でブレークポイント
- trace は `retries` 時に自動取得 (`use.trace: "on-first-retry"`)。失敗時に HTML レポートから動画 / trace が見える

## CI / 安定性

- CI では `workers: 1` で直列実行 (D1 と dev server の競合を避ける)
- スナップショット (`toHaveScreenshot`) は OS / フォント差で flaky になりがちなので **使わない**。視覚 regression が必要になったら別ツール (Chromatic 等) を検討
- `pnpm e2e` は **migrate / seed / dev サーバー起動を全自動でやる**。手動で `pnpm dev` を別に起動しない
- spec が 1 件でも `expect` で 30 秒待つようなら設計を疑う。テスト対象を狭めるか、待機条件を見直す

## カバレッジ方針

- e2e は **golden path** のみ。エッジケースや細かい branch は worker / client の単体テストで担保する
- 1 機能につき 1〜2 spec が目安。多すぎると CI が遅くなり flaky 率が上がる
