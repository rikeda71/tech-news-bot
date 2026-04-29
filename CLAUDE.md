# tech-news-bot

Cloudflare Workers (無料枠) 上で 3 時間ごとに tech blog の RSS / Atom を収集し、D1 に保存して Web UI と JSON Feed / RSS で配信する PoC アプリ。

## 必読

セッション開始時に以下を必ず読むこと。`.claude/rules/` 配下のファイルは Claude Code が自動ロードする。

| ルール                                   | 適用範囲                                  |
| ---------------------------------------- | ----------------------------------------- |
| `.claude/rules/00-overview.md`           | 常時 (アーキ図 + 主要コマンド)            |
| `.claude/rules/01-typescript.md`         | `**/*.{ts,tsx}` 編集時                    |
| `.claude/rules/05-task-flow.md`          | 常時 (issue-first フロー)                 |
| `.claude/rules/10-hono.md`               | `apps/web/worker/api/**` 編集時           |
| `.claude/rules/11-cloudflare-workers.md` | `apps/web/worker/**` 編集時               |
| `.claude/rules/12-react.md`              | `apps/web/client/**` 編集時               |
| `.claude/rules/13-d1-sql.md`             | `apps/web/worker/db/**` / `migrations/**` |
| `.claude/rules/04-feed-config.md`        | `apps/web/worker/feeds.yaml` 編集時       |
| `.claude/rules/20-testing-overview.md`   | 全テスト共通                              |
| `.claude/rules/21-testing-worker.md`     | `apps/web/tests/worker/**`                |
| `.claude/rules/22-testing-client.md`     | `apps/web/tests/client/**`                |
| `.claude/rules/23-testing-e2e.md`        | `apps/web/e2e/**`                         |

## Skills

### D1 の記事活用 skill

| Skill               | 用途                                                                |
| ------------------- | ------------------------------------------------------------------- |
| `tech-news-digest`  | 今日・今週・任意期間の記事をリスト形式でダイジェスト                |
| `tech-news-weekly`  | 週次・月次をストーリー形式のレポートとして生成                      |
| `tech-news-search`  | 特定キーワードで FTS5 全文検索し深掘り解説                          |
| `tech-news-related` | ピボット記事 1 本を起点に関連記事を D1 から探して関係性マップを生成 |
| `tech-news-summary` | 単一の記事 URL を渡して本文ベースで深く日本語要約                   |

### 開発支援 skill

| Skill         | 用途                                                                         |
| ------------- | ---------------------------------------------------------------------------- |
| `test-design` | t-wada 流テスト設計 / レビュー (TDD / AAA / FIRST / 古典派 / モック過剰検出) |

各 skill の手順 / モードは `.claude/skills/<name>/SKILL.md` を参照。

## Agents

| Agent           | 用途                                                                            |
| --------------- | ------------------------------------------------------------------------------- |
| `code-reviewer` | 並行 subagent / 共同作業者の生成コードを本プロジェクト規約でレビュー (信頼度別) |

`Agent({ subagent_type: "code-reviewer", prompt: "..." })` で起動。詳細は `.claude/agents/code-reviewer.md`。

## hooks / settings

- `.claude/settings.json` … プロジェクト共有 (permissions / hooks)。コミット対象。
- `.claude/settings.local.json` … 個人用 override (gitignore 済)。`.claude/settings.local.json.example` を参考に作成。
- `.claude/hooks/*.sh` … 危険コマンドガード / 編集後の自動 oxfmt / セッション開始コンテキスト注入。
