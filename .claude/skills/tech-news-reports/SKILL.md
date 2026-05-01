---
name: tech-news-reports
description: D1 に保存済みの自動生成レポート (daily / weekly / monthly) を一覧・詳細閲覧・削除・期間重複検出する skill。「保存済みのレポートを見たい」「重複してるレポートを整理したい」「不要な report を削除したい」のような問い合わせで起動する。
---

# tech-news-reports skill

D1 の `reports` テーブルに蓄積された自動生成レポートを操作する。

## 対応操作

| 操作     | サブコマンド    | 説明                                        |
| -------- | --------------- | ------------------------------------------- |
| 一覧     | `list`          | kind / 期間でフィルタしてレポート一覧を取得 |
| 詳細閲覧 | `show`          | 指定 id のレポートを本文ごと取得            |
| 重複検出 | `find-overlaps` | 期間が重複するレポートペアを検出            |
| 削除     | `delete`        | 指定 id のレポートを削除 (dry-run default)  |

マージは別 skill (将来追加予定) が担当する。本 skill では find-overlaps の結果から「マージ候補」として提示するだけで、マージ自体は実施しない。

## 手順

### Step 1 — ユーザー意図の分類

ユーザーの要望を以下のどれかに分類する:

- **一覧 (list)**: 「レポートを一覧したい」「今週分の weekly レポートは？」
- **詳細閲覧 (show)**: 「report id=5 の内容を見たい」「レポート 3 番を表示して」
- **重複検出 (find-overlaps)**: 「重複してるレポートがないか確認して」「weekly のレポートが被ってないか調べて」
- **削除 (delete)**: 「古いレポートを消したい」「id=7 のレポートを削除して」

### Step 2 — target の確認

`--target=remote` (本番 D1) か `--target=local` (ローカル開発 DB) を確認する。

- 確認済みでない場合は必ず聞く
- 本番 (remote) の操作は特に注意喚起する

### Step 3 — CLI 実行

```sh
# 一覧
node tools/d1-client/reports.mjs list [--kind=daily|weekly|monthly] [--from=<ISO>] [--to=<ISO>] [--limit=N] --target=<local|remote>

# 詳細
node tools/d1-client/reports.mjs show <id> --target=<local|remote>

# 重複検出
node tools/d1-client/reports.mjs find-overlaps [--kind=daily|weekly|monthly] --target=<local|remote>

# 削除 (dry-run)
node tools/d1-client/reports.mjs delete <id|id1,id2,...> --target=<local|remote>

# 削除 (実行) — ユーザー明示確認後のみ
node tools/d1-client/reports.mjs delete <id|id1,id2,...> --target=<local|remote> --apply
```

### Step 4 — 結果の整形

- `list` の結果は markdown 表で表示する
- `show` の結果は `content` フィールドをそのまま表示する (markdown として描画)
- `find-overlaps` の結果は重複ペアを表形式で表示し、マージ候補として提示する
- `delete` の dry-run 結果は「以下のレポートを削除します (確認してください)」と前置きして対象を表示する

### Step 5 — 削除の確認フロー (delete のみ)

1. まず `--apply` なしで dry-run を実行し、対象レポートをユーザーに目視確認させる
2. ユーザーが「削除してください」と明示確認してから `--apply` を付けて実行する
3. 確認なしに `--apply` を付けない

## ガードレール

- **削除は dry-run default**: ユーザーが明示確認したときのみ `--apply` を付ける
- **本番削除の警告**: `--target=remote` で delete を行う場合、「本番の reports を削除するとレポート viewer からも消えます。本当に削除してよいですか？」と強く確認する
- **認証エラー**: 401/403 が出た場合は以下を案内する:
  ```sh
  pnpm --filter @tnb/web exec wrangler login
  ```

## 出力フォーマット例

### list

```json
{
  "target": "remote",
  "filters": { "kind": "weekly", "from": null, "to": null },
  "total": 3,
  "reports": [
    {
      "id": 5,
      "kind": "weekly",
      "period_start": "2026-04-21T00:00:00Z",
      "period_end": "2026-04-28T00:00:00Z",
      "category": null,
      "lang": "ja",
      "source_skill": "tech-news-weekly",
      "generated_at": "2026-04-28T06:00:00Z",
      "content_len": 4200
    }
  ]
}
```

### find-overlaps

```json
{
  "target": "local",
  "total_pairs": 1,
  "overlaps": [
    {
      "a": { "id": 3, "kind": "weekly", "period_start": "2026-04-14T00:00:00Z", "period_end": "2026-04-21T00:00:00Z", ... },
      "b": { "id": 4, "kind": "weekly", "period_start": "2026-04-17T00:00:00Z", "period_end": "2026-04-24T00:00:00Z", ... }
    }
  ]
}
```

## 関連ファイル

- 実装: `tools/d1-client/reports.mjs`
- スキーマ: `migrations/0001_initial.sql` (`reports` テーブル)
- 関連 skill: `.claude/skills/tech-news-digest/SKILL.md`, `.claude/skills/tech-news-weekly/SKILL.md`
