# tech-news-bot — Claude 向けプロジェクトガイド

Cloudflare Workers (無料枠) 上で 3 時間ごとに tech blog の RSS / Atom を収集し、D1 に保存して Web UI と JSON Feed / RSS で配信するアプリケーション。

## 必読ルール

ユーザー / プロジェクトのルールは `.claude/rules/` 配下に分割定義。Claude Code は会話開始時に必ず一読すること。

## アーキテクチャ概略

```
tech-news-bot/                         pnpm workspace root
├── apps/
│   └── web/                           デプロイ単位 (Cloudflare Worker + SPA)
│       ├── client/                    React 18 + Vite SPA
│       ├── worker/                    Hono ベース API + cron collector
│       │   ├── api/                   /api/* (articles, stats, feeds, health, admin, syndication)
│       │   ├── collector/             RSS/Atom 取得・パース・de-dup
│       │   ├── db/                    D1 アクセス層
│       │   └── index.ts               Worker entry (fetch + scheduled)
│       ├── tests/                     vitest + @cloudflare/vitest-pool-workers
│       ├── vite.config.ts             @cloudflare/vite-plugin + react + yaml
│       ├── vitest.config.ts           cloudflareTest plugin
│       └── wrangler.toml              D1 / cron / assets binding
├── packages/
│   ├── shared-types/                  全パッケージ共通の TS 型
│   └── feed-config/                   feeds.yaml + ローダー (YAML を build 時に inline)
├── migrations/                        D1 マイグレーション (リポジトリルートで保持し全アプリで共有)
├── .claude/                           Claude Code 用 rules / skills
├── .github/workflows/                 CI (vp check/build/test) / Deploy
├── pnpm-workspace.yaml                catalog: で vite/vitest を vp に alias
├── tsconfig.base.json
├── vite.config.ts                     ルート: oxlint/oxfmt 設定 (vp lint/fmt が読む)
└── package.json                       root: ワークスペース横断スクリプト
```

### パッケージ依存関係

```
@tnb/web ─┬─> @tnb/feed-config ─> @tnb/shared-types
          └─> @tnb/shared-types
```

すべての internal パッケージは `workspace:*` 参照。型のみ提供する純 TS パッケージなので build ステップは不要 (main/exports は src/index.ts を直接指している)。

## 主要コマンド (root から)

ツールチェインは [Vite+](https://viteplus.dev/) (`vp`) ベース。`pnpm` スクリプトは `vp` を呼ぶ thin wrapper。

| 目的                        | コマンド (vp 直)                   | pnpm script          |
| --------------------------- | ---------------------------------- | -------------------- |
| dev サーバー起動            | `vp dev` (`apps/web/`)             | `pnpm dev`           |
| 本番ビルド                  | `vp run build`                     | `pnpm build`         |
| lint                        | `vp lint`                          | `pnpm lint`          |
| format                      | `vp fmt --write`                   | `pnpm format`        |
| typecheck                   | `pnpm -r typecheck`                | `pnpm typecheck`     |
| 全部まとめて                | `vp check`                         | `pnpm check`         |
| テスト                      | `vp test run` (`apps/web/` で実行) | `pnpm test`          |
| Cloudflare 型生成           | —                                  | `pnpm cf-typegen`    |
| D1 マイグレーション (local) | —                                  | `pnpm migrate:local` |
| D1 マイグレーション (prod)  | —                                  | `pnpm migrate:prod`  |
| デプロイ                    | —                                  | `pnpm deploy`        |

`vp` インストール: `curl -fsSL https://vite.plus | bash`

設定:

- **lint/format ルール**: ルート `vite.config.ts` の `defineConfig({ lint, fmt })`
- **vite/vitest の本体**: `pnpm-workspace.yaml` の `catalog` で `@voidzero-dev/vite-plus-{core,test}` に alias、`overrides` で全 transitive dep にも適用
- **テストランナー**: vitest 由来の API は `vite-plus/test` から import (`apps/web/tests/setup.ts`)。Cloudflare の `cloudflare:test` (`applyD1Migrations`, `env`, `SELF`) はそのまま使える

## 規約

- **言語**: TypeScript strict、`target: ES2023`、`module: ESNext`、`moduleResolution: bundler`。
- **Lint/Format**: oxlint + oxfmt (`vp lint` / `vp fmt`)。ESLint/Prettier は使用しない。
- **テスト**: `vite-plus/test` (= vp 同梱の vitest 4 系) + `@cloudflare/vitest-pool-workers` v0.15。テストごとに `reset()` + `applyD1Migrations` (`apps/web/tests/setup.ts`)。
- **import スタイル**:
  - 同一パッケージ内: 相対 import (`../db/articles`)
  - 別パッケージ: workspace alias (`@tnb/shared-types`, `@tnb/feed-config`)
- **commit / push**: ユーザーから明示指示がない限り行わない。
- **新機能のテスト**: 既存 vitest スイート (`apps/web/tests/`) に追加。

## Cloudflare 固有事項

- **D1**: `wrangler.toml` の `database_id` は本番作成後に差し替え。マイグレーション dir は root の `migrations/` を相対パス (`../../migrations`) で参照。
- **Static Assets**: ハッシュ付き `/assets/*` は `immutable, max-age=31536000`、それ以外 (HTML/SPA fallback) は `no-cache`。
- **Cron**: `0 */3 * * *` で `scheduled()` → `collectAll()` を起動。
- **Secrets** (GitHub Actions): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` を repository secrets に登録すること (Deploy 失敗時はここ要確認)。

## フィード設定 (feeds.yaml) の追加・更新

1. `packages/feed-config/feeds.yaml` を編集
2. `id` は kebab-case でユニーク、`category` は `bigtech | ai | jp`、`lang` は `ja | en`
3. 追加前に `curl -sSL <url>` で 200 + 妥当な RSS/Atom を返すこと確認
4. PR を作る (CI が build/test を実行)

YAML は `@modyfi/vite-plugin-yaml` により build 時に JSON へ変換され Worker bundle に inline される。runtime 依存は無し。

## Skill: `tech-news-digest`

D1 から今日 / 今週の記事を抽出して日本語で要約 + トレンド検出する Claude Skill。詳細は `.claude/skills/tech-news-digest/SKILL.md` 参照。
