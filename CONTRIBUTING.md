# Contributing to tech-news-bot

Cloudflare Workers (無料枠) 上で 6 時間ごとに tech blog の RSS / Atom を収集し、D1 に保存して Web UI と JSON Feed / RSS で配信するアプリケーション。Worker は Hono ベース、フロントエンドは React 19 + Vite SPA、ツールチェインは [Vite+](https://viteplus.dev/) (`vp`) を使う。

---

## 開発環境セットアップ

**必要なもの**

- Node.js 24 以上
- pnpm 10 以上
- Vite+ (`vp`): 公式サイト [viteplus.dev](https://viteplus.dev/) の手順を参照してインストール

**手順**

```bash
# 依存インストール
pnpm install

# Cloudflare Worker の型を生成 (wrangler.toml から自動生成)
pnpm cf-typegen

# ローカル D1 にマイグレーションを適用
pnpm migrate:local
```

これで `pnpm dev` による開発サーバーが起動できる状態になる。

---

主要コマンドの一覧は [README.md#主要コマンド](README.md#主要コマンド) を参照。

---

## 開発ワークフロー

1. **issue 起票** — 実装に着手する前に GitHub issue を作成し、背景・計画・完了条件を記載する（詳細は後述）
2. **ブランチ作成** — `main` から `<type>/<summary>` 形式でブランチを切る（例: `feat/add-feed-xxx`、`fix/collector-timeout`、`chore/update-deps`）
3. **実装** — コーディング規約・テスト規約に従って実装する
4. **PR 作成** — PR テンプレートに従って記載し `Closes #<issue番号>` を入れる
5. **review → merge** — CI (lint / build / test) が green になってからレビューを受ける
6. **deploy** — `main` への merge で GitHub Actions が自動デプロイ

---

## コーディング規約

詳細は [`.claude/rules/01-typescript.md`](.claude/rules/01-typescript.md) を参照。要点:

- **TypeScript strict mode**。`any` は最小限、必要なら `unknown` で受けて narrow する
- **Lint**: oxlint (`vp lint`)。**Format**: oxfmt (`vp fmt`)。ESLint/Prettier は使用しない
- lint/fmt 設定はルート `vite.config.ts` に集約。`.oxlintrc.json` などは追加しない
- **import 順序**: 外部パッケージ → 相対 import の順（oxfmt が自動整列）
- アプリケーションコードは `apps/web/` 配下。深い相対 import (`../../../`) はテストファイルのみ許容
- コメントは「なぜ」を書く。「何を」はコードで読めるので書かない
- 早期 return を優先し、ネストを浅く保つ
- エラーは例外でなく Result 風 `{ status, ... }` パターンで返す（`worker/collector/index.ts` の `CollectResult` 参照）
- 関数 200 行・ファイル 400 行を目安に分割

---

## テスト規約

詳細は [`.claude/rules/20-testing-overview.md`](.claude/rules/20-testing-overview.md) を参照。要点:

- **テストランナー**: `vite-plus/test` (vitest) + `@cloudflare/vitest-pool-workers`
- **起動**: `pnpm test` (worker) / `pnpm test:client` (client) / `pnpm e2e` (Playwright)
- **テストファイル配置**: `apps/web/tests/<area>/<file>.test.ts`（area は `worker` / `collector` / `db` / `api` など）
- テスト実行前に **`pnpm build` が必要**（vitest-pool-workers が `apps/web/dist/client` を要求するため）
- `vitest` の API は `vite-plus/test` から import する。生 `vitest` は import しない
- `cloudflare:test` から `env`、`SELF`、`applyD1Migrations`、`reset` を import
- 統合テストは `SELF.fetch("https://example.com/...")` 経由で Worker を E2E で呼ぶ
- **新機能・バグ修正はテストを追加してから PR を出す**

---

## フィード追加手順

詳細は [`.claude/rules/04-feed-config.md`](.claude/rules/04-feed-config.md) を参照。要点:

1. `apps/web/worker/feeds.yaml` を編集する
2. `id` は全フィード横断でユニーク、kebab-case
3. 追加前に `curl -sSL <url>` で 200 + 妥当な RSS/Atom が返ることを確認
4. `category` は `bigtech | ai | jp | personal` のみ。著名な個人ブログ (Zenn の個人 user feed など) は `personal` カテゴリを使う (Zenn publication / 企業ブログは `jp` 等の適切なカテゴリへ)
5. `lang` は `ja | en` のみ
6. 使えなくなったフィードは削除より `enabled: false` で一時停止を優先する
7. PR を作る（CI が build/test を実行）

---

## PR の作り方

詳細は [`.claude/rules/05-task-flow.md`](.claude/rules/05-task-flow.md) を参照。

**issue 作成は必須**（些細な typo 修正などを除く）。issue のタイトルは `[task] <概要>` を基本形とし（bug なら `[bug]`、調査なら `[investigation]`）、本文に背景・計画・完了条件を記載する。

PR テンプレートに従って以下を記載する:

- **Summary**: 変更内容の要約
- **Why**: なぜ必要か（issue の背景を引用しても良い）
- **What changed**: 変更ファイルと変更内容
- **Testing**: 動作確認方法
- **Checklist**: `pnpm check` / `pnpm test` / migration 適用確認 などを確認してチェック
- **Related issue**: `Closes #<n>` を必ず入れる

**レビューコメントへの返信**: 指摘を反映した場合はコミット hash を添えて返信する。反論がある場合は理由を簡潔に説明してディスカッションする。

---

## ディレクトリ構成（概略）

```
tech-news-bot/
├── apps/web/
│   ├── client/          React 19 + Vite SPA
│   ├── worker/          Hono API + cron collector
│   │   ├── api/         /api/* エンドポイント
│   │   ├── collector/   RSS/Atom 取得・パース
│   │   ├── db/          D1 アクセス層
│   │   ├── notify/      Slack 通知 (日次ダイジェスト)
│   │   └── feeds.yaml   収集対象フィード定義
│   └── tests/           vitest テスト
├── migrations/          D1 マイグレーション
└── tools/d1-client/     D1 抽出 CLI (Skill 用)
```
