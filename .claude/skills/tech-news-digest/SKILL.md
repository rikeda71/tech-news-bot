---
name: tech-news-digest
description: D1 に蓄積された tech blog の記事を「今日 / 今週 / 任意期間」の粒度でさらい、日本語で要約してトレンドを抽出する。ユーザーが「今日のニュースまとめて」「週次サマリ作って」「最近のトレンド何？」のような問い合わせをした時に必ずこのスキルを起動する。
---

# tech-news-digest

## やること

D1 に保存された記事 (`articles` table) を期間指定で抽出し、以下を生成:

1. **記事リスト**: タイトル / フィード元 / category / 公開日時
2. **日本語要約**: 記事ごとに 1〜2 文の要約。元記事が英語なら翻訳しつつ日本語で書く
3. **トレンド検出**: タイトル・要約の頻出キーワードと category 分布から「今 hot な領域」を抽出

## 使い方

ユーザーが期間を明示しない場合は **今日 (UTC 24h 以内)** をデフォルトとする。

許容される期間指定:

| 入力              | 範囲                                        |
| ----------------- | ------------------------------------------- |
| 今日 / today      | 過去 24 時間                                |
| 今週 / this week  | 過去 7 日                                   |
| 月次 / this month | 過去 30 日                                  |
| 過去 N 日         | `published_at > datetime('now', '-N days')` |

## 手順 (Claude が踏むステップ)

### 1. D1 に対するクエリ実行

`tools/d1-client/recent.mjs` を Node から呼ぶ。引数:

- `--since=<today|week|month|N>` (必須)
- `--target=<local|remote>` (省略時 `local`)
- `--category=<bigtech|ai|jp>` (任意)
- `--lang=<ja|en>` (任意)
- `--limit=<N>` (デフォルト 200)

実行例:

```sh
node tools/d1-client/recent.mjs --since=today --target=remote
node tools/d1-client/recent.mjs --since=week --category=ai --target=remote
```

出力は JSON で次の形:

```json
{
  "since": "2026-04-26T05:00:00.000Z",
  "target": "remote",
  "total": 42,
  "articles": [
    {
      "id": 123,
      "guid": "...",
      "feed_id": "openai-blog",
      "feed_name": "OpenAI News",
      "title": "...",
      "url": "https://...",
      "summary": "...",
      "published_at": "2026-04-27T...",
      "category": "ai",
      "lang": "en"
    }
  ],
  "by_category": { "ai": 12, "bigtech": 18, "jp": 12 },
  "by_feed": { "openai-blog": 3, "...": ... },
  "top_terms": [ ["llm", 8], ["mcp", 5], ... ]
}
```

`top_terms` は title + summary を低コストに tokenize して頻度 top-N を返す簡易トレンド指標。

### 2. 出力フォーマット (Claude が生成する)

Markdown で次の構造で返す:

```md
# Tech News Digest — <期間ラベル>

期間: <ISO start> 〜 <ISO end> / 総件数: <total>

## サマリ (重要記事 5〜10 件)

- **[<タイトル>](url)** _(<feed_name>, <category>)_ — <1〜2 文の日本語要約>
- ...

## トレンド

- **<キーワード>**: 出現 <N> 件 / 関連記事: <短い文脈>
- ...

## カテゴリ別件数

| Category | 件数 |
| -------- | ---- |
| bigtech  | N    |
| ai       | N    |
| jp       | N    |
```

### 3. ガードレール

- **PII / 機密情報**: D1 内には公開記事のみ蓄積されているはずだが、author 名以外の個人情報が混ざっていたら除外する。
- **過剰な要約数**: total が 50 を超える場合は category ごとに重要 3〜5 件まで絞り、残りは件数のみ報告。
- **D1 接続失敗時**: `--target=remote` で 401/403 が出たら `wrangler login` 推奨を user に伝える。`--target=local` ならまず `pnpm migrate:local` と `pnpm dev` で 1 回 collection を回すよう案内する。
- **記事 0 件**: スキルは正直に「該当期間に記事なし」と報告。creative writing は禁止。

## 関連ファイル

- 実装: `tools/d1-client/recent.mjs`
- スキーマ: `migrations/0001_init.sql` (articles, feeds テーブル)
- 型: `packages/shared-types/src/index.ts` (`Article` interface)
