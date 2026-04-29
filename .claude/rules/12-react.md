---
paths:
  - "apps/web/client/**/*.ts"
  - "apps/web/client/**/*.tsx"
  - "apps/web/index.html"
---

# React / Vite SPA 規約 (React 19 + 2026 年版ベストプラクティス)

`react@19.2` / `react-dom@19.2` / Vite + `@vitejs/plugin-react` + Tailwind v4 を前提とする。

## ファイル配置

- `apps/web/client/` 直下に `App.tsx` / `main.tsx` / `index.css`
- `client/components/<Component>.tsx` … 1 コンポーネント 1 ファイル
- `client/hooks/use<Name>.ts` または `.tsx` … 共有フック
- `client/types/api.ts` … API レスポンスの型 (worker と独立した型を持つ。RPC は使っていない)
- `client/lib/` … 純関数ヘルパー (`formatDate.ts` など)
- `client/views/` … ルート単位の large view (例: `ArticlesView.tsx`)

## React 19 で使うべき / 避けるべき機能

### 使うべき

- **`use()` フック**: Promise / Context を `use()` で読む (Suspense との相性が良い)
- **Actions** (`useActionState`, `<form action={...}>`): フォームの pending / error 状態を React が管理
- **`useOptimistic`**: 楽観的 UI 更新 (記事の bookmark トグル等)
- **`ref` を prop として渡す**: `forwardRef` は **不要に** なった。直接 `function Foo({ ref, ...props })` と書ける
- **`<Context>` を直接 provider として使える**: `<Context.Provider>` でなく `<Context>` のみで OK
- **document メタデータ**: `<title>`, `<meta>`, `<link>` をコンポーネント内に直接書ける (React が `<head>` に hoist)
- **Asset loading の suspense**: `<link rel="stylesheet">` 等の load を Suspense が待つ

### 避ける

- **Server Components / Server Actions**: このプロジェクトは Cloudflare Worker + 静的 SPA で RSC 環境ではないため使わない (`use server` は build エラー)
- **古い `forwardRef`**: 既存コードに残っていれば段階的に prop ref に移行
- **`memo` / `useMemo` / `useCallback` の濫用**: React Compiler (Beta) が自動最適化する想定。手動 memo はホットパスかつ計測してから

## State 管理

- ローカル state: `useState`
- ページ間で共有 / URL 反映: `useUrlState` (既存フック) で querystring に同期。SPA リロードで状態保持
- 永続化: `localStorage` 経由。`useLocalStorage` 系のフックを使い、SSR 安全 (`typeof window !== "undefined"` チェック) は不要 (本プロジェクトは React を SSR していない。Worker fallback で HTMLRewriter ベースの meta 書き換えを行うが、React 自体は CSR のまま)
- グローバル UI state: Context + `use()`。Redux / Zustand 等は導入していない

## データ取得

- ネイティブ `fetch` + 自作フック (`useArticles`, `useFeedArticles` 等)
- React Query / SWR は導入していない。導入するなら新規 issue で議論
- レスポンスは `client/types/api.ts` の型に narrow する。worker 側の型をそのまま import しない (依存方向を切るため)
- pagination は cursor 方式 (`/api/articles?cursor=...`)。`useArticles` の `loadMore()` を使う
- abort: `useEffect` 内 fetch は `AbortController` を返り値で cleanup 関数に渡す

## アクセシビリティ

- セマンティック HTML を優先 (`<button>`, `<nav>`, `<main>`, `<article>`, `<time>`)
- `<button>` には必ず `type="button"` (form submit 暴発防止)
- インタラクティブ要素は `aria-label` または可視ラベル必須
- キーボード操作は `useKeyboardShortcuts` / `useKeyboardNav` で集約 (フォーカス可視は Tailwind の `focus-visible:` で)
- カラーコントラストは WCAG AA (4.5:1) を満たす。Tailwind の `text-zinc-700` 以上を本文に使う

## スタイリング (Tailwind v4)

- `apps/web/client/index.css` で `@import "tailwindcss";`
- `@theme { ... }` でカスタム変数 (色、フォント) を定義
- ユーティリティ first。3 つ以上同じパターンが出たら component 抽出か `@apply` でクラス化
- ダークモード: `data-theme="dark"` 属性で切替 (既存 `useTheme` フック)。Tailwind 側は `dark:` variant でなく `[data-theme="dark"]:` カスタム variant を使う設計

## パフォーマンス

- 画像は `<img loading="lazy" decoding="async">` を基本に
- リストは仮想スクロールせず、cursor pagination で 1 ページ 30 件程度に抑える
- React DevTools Profiler で計測してから最適化。先回り `memo` は禁止

## TypeScript on React

- props 型は `interface` または `type`。export せず内部のみで完結させる (component 単位)
- children を受ける場合は `children: React.ReactNode`
- event handler は React の合成イベント型を使う: `React.ChangeEvent<HTMLInputElement>` など
- `any` を使わず、外部から来る値は `unknown` で受けて narrow する
