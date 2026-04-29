---
paths:
  - "apps/web/tests/client/**/*.ts"
  - "apps/web/tests/client/**/*.tsx"
  - "apps/web/tests/client/setup.ts"
  - "apps/web/vitest.client.config.ts"
---

# Client テスト規約 (vitest + happy-dom + React Testing Library)

## 配置

- `apps/web/tests/client/<TargetName>.test.tsx`
- ファイル名はテスト対象と 1:1 にする (`useArticles.ts` → `useArticles.test.tsx`、`ArticleCard.tsx` → `ArticleCard.test.tsx`)
- `tests/client/` 直下にフラット配置 (現状のスタイル維持)。深く階層化しない

## ランナー設定

`apps/web/vitest.client.config.ts`:

- `environment: "happy-dom"` (jsdom より高速)
- `setupFiles: ["./tests/client/setup.ts"]` (RTL の cleanup 等)
- `globals: false` (`describe` / `it` / `expect` を必ず import)
- include: `tests/client/**/*.test.{ts,tsx}` のみ

## import 規約

```ts
import { describe, it, expect, beforeEach, vi } from "vite-plus/test";
import { render, screen, waitFor } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
```

- 生 `vitest` から import しない
- `@testing-library/react` の `renderHook` / `act` は `react-hooks-testing-library` ではなく RTL に統合済み (RTL v13+)

## コンポーネントテスト

- ユーザー視点で書く (RTL 哲学): クラス名や内部 state でなく、画面に出る role / text / label で要素を取得
- 推奨セレクタ優先順位:
  1. `screen.getByRole("button", { name: "保存" })`
  2. `screen.getByLabelText("メールアドレス")`
  3. `screen.getByText(/エラー/)`
  4. `screen.getByTestId("foo")` ← 最終手段
- インタラクションは `userEvent` を使う (`fireEvent` ではなく)
- 非同期表示は `findBy*` または `await waitFor(() => ...)`

```tsx
it("ArticleCard はタイトルクリックで onSelect を呼ぶ", async () => {
  const onSelect = vi.fn();
  render(<ArticleCard article={fixture} onSelect={onSelect} />);
  await userEvent.click(screen.getByRole("link", { name: fixture.title }));
  expect(onSelect).toHaveBeenCalledWith(fixture.id);
});
```

## カスタムフックのテスト

- `renderHook` で hook を呼ぶ
- 引数を変えて再評価したい場合は `initialProps` + `rerender`
- act で囲むのは setState を直接呼ぶケースのみ。ほとんどのケースで RTL が自動で act してくれる

```tsx
it("useArticles は loadMore で次ページを連結する", async () => {
  const { result } = renderHook(() => useArticles({}, NO_FILTER));
  await waitFor(() => expect(result.current.articles).toHaveLength(30));
  await act(async () => {
    await result.current.loadMore();
  });
  expect(result.current.articles).toHaveLength(60);
});
```

## テスト学派 (古典派)

本プロジェクトの client テストは **古典派 (classical / Detroit)** (`20-testing-overview.md` 参照)。

- **実物の DOM** (happy-dom) + **実物の React render** (RTL) で検証
- **shallow render しない**。コンポーネントを mock しない
- セレクタはユーザー視点 (role / label / text)。実装詳細 (クラス名 / 内部 state) は触らない
- assert は **画面に何が見えるか / 引数として何が来たか** (state ベース)。`onClick` が呼ばれた回数だけを assert するのは avoid (画面が変わったかどうかも見る)

### モックして OK

- `globalThis.fetch` (外部境界)
- `window.matchMedia` / `IntersectionObserver` (happy-dom が完全サポートしないもの)
- 時刻 (`vi.setSystemTime`)
- 親が渡す callback prop (`onSelect = vi.fn()`)。これは「相互作用」ではなく「子から親へのデータの流れ」を見るので OK

### モックしてはいけない

- 子コンポーネント (`vi.mock("./ArticleCard")`)。代わりに実物を render して画面を見る
- カスタムフック (`vi.mock("../hooks/useArticles")`)。フック自体を `renderHook` で別途テストする方が安全
- 純関数 (`formatDate` など)。実物を import

## fetch のスタブ

- `vi.stubGlobal("fetch", vi.fn(async (url) => new Response(JSON.stringify(fixture))))` で `globalThis.fetch` を差し替え
- 各テスト後に `vi.unstubAllGlobals()` を `afterEach` で呼ぶ
- MSW を使う構成にはなっていないが、複雑な API 連鎖が増えたら導入を検討

## localStorage / sessionStorage / window.matchMedia

- happy-dom が大半をサポート。React のフック内で直接触って OK
- `matchMedia` は明示的に stub: `vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })))`

## アクセシビリティのスナップショット

- 必要に応じて `axe-core` を導入して a11y 検証 (現状未導入)
- 最低限 `getByRole` でアクセスできない UI は警告とみなす

## スナップショット禁止

- DOM スナップショットは差分が大きく頻繁に壊れるため使わない
- 代わりに「この要素が見える / この値が表示される」を狙い撃ちで assert

## テスト対象外

- React 内部の挙動 (`useState` の挙動など) はテストしない
- サードパーティコンポーネント (Tailwind、Radix 等使っていれば) の挙動はテストしない
