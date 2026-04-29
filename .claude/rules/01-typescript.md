---
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.mts"
---

# TypeScript コーディングスタイル

## 言語仕様

- **strict mode**: `tsc --strict` 相当を維持。`tsconfig.base.json` で有効な厳格化フラグは `strict: true` / `noUnusedLocals` / `noUnusedParameters` / `noFallthroughCasesInSwitch` / `noImplicitOverride`。さらに `noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` を増やしたい場合は別 PR で導入し、既存違反を一掃してから rule に追記する
- **target**: ES2023、**module**: ESNext、**moduleResolution**: bundler
- Node 24+ / Cloudflare Workers ランタイムを前提。Node 専用 API (`fs`, `path`) は CLI ツール (`tools/`) のみ。Worker 側で使うと build/runtime で壊れる
- `import type { ... }` を積極的に使い、型オンリーの import を value import から分離する (oxfmt が部分的に整列するが、`type` 修飾は手動で付ける)

## 型安全のガイドライン

- `any` の使用は最小限。受け取れるなら `unknown` で受けて narrow する
- 型アサーション (`as Foo`) は外部入力 (RSS XML パース、env binding) に限定し、内部ロジックでは使わない
- `null` と `undefined` の使い分け: D1 が null を返すフィールドは `| null`、optional な引数や戻り値は `?` (= `| undefined`)。両方ありえる場合のみ `T | null | undefined`
- discriminated union を使った Result 風パターンを既存 (`worker/collector/index.ts` の `CollectResult`) に倣う:

```ts
type CollectResult =
  | { status: "ok"; saved: number; skipped: number }
  | { status: "error"; reason: "timeout" | "parse" | "http"; detail: string };
```

例外を throw するのではなく Result を返すことで、呼び出し側が網羅的に分岐できる

## Lint / Format

- **Lint**: oxlint (`vp lint`)。**Format**: oxfmt (`vp fmt`)。ESLint / Prettier は使わない
- 設定はルート `vite.config.ts` に集約 (`defineConfig({ lint, fmt })`)。`.oxlintrc.json` / `.oxfmtrc.json` は作らない
- `vp check --fix` で lint/format を一括自動修正できる
- import 順序: 外部パッケージ → 相対 import の順 (oxfmt が自動整列するので手動調整不要)

## ファイル / 関数の粒度

- 関数 200 行・ファイル 400 行を目安に分割
- 早期 return を優先しネストを浅く保つ
- 1 ファイルに複数 export しても良いが、責務が違うものは分ける (例: `articles-query.ts` と `articles-write.ts`)

## ヘルパーの配置 (utils/ の濫用禁止)

ヘルパー関数を **反射的に `utils/` に置かない**。`utils/` は「**実際に複数ファイルから import されている、責務が独立した関数**」のための置き場であって、「いつか共通化されるかも」のバッファではない。

| 状況                               | 置く場所                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------ |
| 1 ファイルでしか使わない           | **そのファイル内** (export せずローカル関数 / 同ファイルの top-level 関数)           |
| 1 ディレクトリ内の 2-3 ファイル    | そのディレクトリ内に `helpers.ts` や `<domain>.ts` を作る (例: `collector/parse.ts`) |
| 2 つ以上の独立ドメインから使われる | `worker/utils/<name>.ts` または `client/utils/<name>.ts`                             |
| 型だけの定義                       | 単一ファイルなら使う場所、複数なら `worker/types.ts` / `client/types/api.ts` に集約  |

判断ルール:

- **新規 helper を `utils/` に置きたくなったら、まず "import 元が現在 2 ファイル以上あるか" を確認**。1 つしかないなら呼び出し側に inline する
- **dead code は速やかに削除**。「将来使うかも」の helper を置かない (YAGNI)。型エイリアス (`NonEmptyArray<T>` 等) も使われていないなら削除
- **既存の `utils/` を増やすな**。ファイル名が抽象的 (`utils.ts`, `helpers.ts`) になりがちで責務が膨らむ。代わりに具体的なドメイン名 (`xml.ts`, `etag.ts`) で切る
- **テストヘルパーも同じ**。`tests/fixtures/` は seed データ専用。テストロジックの共通化は `tests/<area>/_helpers.ts` のような具体名で

例: `worker/api/articles.ts` の list endpoint で limit/cursor を parse する `parseListQuery(c)` は **articles.ts 内のローカル関数で OK**。他の API ファイルから使うようになって初めて `worker/api/_helpers.ts` などに昇格させる。

## コメント

- 「**なぜ**」を書く。「何を」はコードで読めるので書かない
- `// TODO(#<issue>):` 形式で残す。orphan TODO は CI で検出する想定
- 日本語可。長文ドキュメントは `.claude/rules/` か README に置く

## エラーハンドリング

- `try / catch` を書く層は **境界** (HTTP handler / cron entry / 外部 fetch) のみ。内側は Result 型を返す
- catch した値は `unknown`。`error instanceof Error` で narrow してから `error.message` を読む
- ロギングは `console.error` で OK (Cloudflare の `wrangler tail` で見える)

## 非同期

- `Promise.all` / `Promise.allSettled` を使う場面では明示的にエラー伝播の意図を選ぶ:
  - 1 件失敗で全体を中断 → `Promise.all`
  - 全件試行 → `Promise.allSettled` + 結果集計
- `await` を for-of の中で逐次回すのは「同時実行を避けたい」明確な意図がある時だけ。並列で OK なら `Promise.all`
