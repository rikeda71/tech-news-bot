# プロジェクト概要 / 主要コマンド (常時ロード)

## アプリケーション概要

Cloudflare Workers (無料枠) 上で 3 時間ごとに tech blog の RSS / Atom を収集 → D1 に保存 → Web UI と JSON Feed / RSS で配信する PoC アプリ。

## ディレクトリ構成

```
tech-news-bot/                         pnpm workspace root
├── apps/
│   └── web/                           デプロイ単位 (Cloudflare Worker + SPA)
│       ├── client/                    React 19 + Vite SPA
│       ├── worker/                    Hono ベース API + cron collector
│       │   ├── api/                   /api/* (articles, stats, feeds, health, admin, syndication)
│       │   ├── collector/             RSS/Atom 取得・パース・de-dup
│       │   ├── db/                    D1 アクセス層
│       │   ├── feeds.yaml             収集対象フィードの定義 (build 時 inline)
│       │   ├── feed-config.ts         feeds.yaml ローダー
│       │   ├── types.ts               Env / FeedConfig / Article などの worker 内型
│       │   └── index.ts               Worker entry (fetch + scheduled)
│       ├── tests/worker/              vitest + @cloudflare/vitest-pool-workers
│       ├── tests/client/              vitest + happy-dom + RTL
│       ├── e2e/                       Playwright (chromium)
│       ├── playwright.config.ts
│       ├── vite.config.ts             @cloudflare/vite-plugin + react + yaml
│       ├── vitest.config.ts           cloudflareTest plugin (worker 用)
│       ├── vitest.client.config.ts    happy-dom 環境 (client 用)
│       └── wrangler.toml              D1 / cron / assets binding
├── migrations/                        D1 マイグレーション (リポジトリルートで保持)
├── tools/d1-client/                   D1 から記事を抽出する CLI (Skill 用)
├── .claude/                           Claude Code 用 rules / skills / settings / hooks
├── .github/workflows/                 CI (vp check/build/test) / Deploy
├── pnpm-workspace.yaml                catalog: で vite/vitest を vp に alias
├── tsconfig.base.json
├── vite.config.ts                     ルート: oxlint/oxfmt 設定 (vp lint/fmt が読む)
└── package.json                       root: ワークスペース横断スクリプト
```

PoC 規模 (Worker 1 個) のため `packages/` は廃止し、すべての worker コードを `apps/web/worker/` 配下に inline している。将来 2 つ目の deploy unit や型を共有する CLI が増えた場合のみ再度 `packages/` を切り出す。

## 主要コマンド (root から)

ツールチェインは [Vite+](https://viteplus.dev/) (`vp`) ベース。`pnpm` スクリプトは `vp` を呼ぶ thin wrapper。

| 目的                        | コマンド                                       | pnpm script          |
| --------------------------- | ---------------------------------------------- | -------------------- |
| dev サーバー起動            | `vp dev` (`apps/web/`)                         | `pnpm dev`           |
| 本番ビルド                  | `vp build`                                     | `pnpm build`         |
| lint                        | `vp lint`                                      | `pnpm lint`          |
| format                      | `vp fmt --write`                               | `pnpm format`        |
| typecheck                   | `pnpm -r typecheck`                            | `pnpm typecheck`     |
| 全部まとめて                | `vp check`                                     | `pnpm check`         |
| 自動修正                    | `vp check --fix`                               | `pnpm check:fix`     |
| worker テスト               | `vp test run` (`apps/web/`)                    | `pnpm test`          |
| client テスト               | `vp test run --config vitest.client.config.ts` | `pnpm test:client`   |
| e2e テスト (Playwright)     | `pnpm e2e`                                     | `pnpm e2e`           |
| Cloudflare 型生成           | `wrangler types`                               | `pnpm cf-typegen`    |
| D1 マイグレーション (local) | —                                              | `pnpm migrate:local` |
| D1 マイグレーション (prod)  | —                                              | `pnpm migrate:prod`  |
| デプロイ                    | —                                              | `pnpm deploy`        |

`vp` インストール手順は公式ドキュメント https://viteplus.dev/ を参照 (curl を直接 shell に pipe する形式は `.claude/hooks/block-dangerous.sh` でブロックされるため、スクリプトを取得 → 中身を確認 → 実行、の手順を踏む)

## Git / commit / push

- **commit / push はユーザー明示指示があるときのみ**。Claude が勝手に push しない
- 新タスクは `.claude/rules/05-task-flow.md` に従い必ず GitHub issue を先に作る
- import スタイル: 全て相対 path (`../db/articles`)。workspace alias は使わない
- 深い相対 import (`../../../...`) はテストファイル (`apps/web/tests/`, `apps/web/e2e/`) のみ許容
- ブランチ名は `<type>/<summary>` 形式 (例: `feat/add-rss-cache`, `fix/d1-cursor-bug`, `chore/claude-config`)
