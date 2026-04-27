---
name: tech-news-digest
description: D1 に蓄積された tech blog の記事を「今日 / 今週 / 任意期間」の粒度で抽出し、Stage 1〜4 (収集 → 選定 → WebFetch で本文取得 → トレンド分析) で日本語ダイジェストを生成する。"今日のニュースまとめて" "週次サマリ作って" "最近のトレンド何？" のような問い合わせで起動する。要約品質を本文ベースで保つため、デフォルトで WebFetch を使う deep モードで動作する。
---

# tech-news-digest

## やること

D1 (`articles` テーブル) から期間指定で記事メタデータを取得し、4 ステージで日本語ダイジェストを生成する。要約・トレンド分析は Claude が担い、Worker 側の変更や外部 LLM 呼び出しは不要。

## モード

| Mode             | カバー範囲 | 用途                                      |
| ---------------- | ---------- | ----------------------------------------- |
| `quick`          | Stage 1+2  | `summary` 抜粋 (≤500 字) だけで軽量に要約 |
| `deep` (default) | Stage 1〜4 | URL を WebFetch で取得して本文ベース要約  |
| `trend`          | Stage 1+4  | 本文要らず、傾向解析だけ                  |

期間もモードも指定がない場合のデフォルトは **`since=today` / `mode=deep`**。「ざっくり」「軽く」と指示されたら `quick`、「トレンドだけ」「最近の傾向」なら `trend` を選ぶ。

## 対象期間

| 入力              | 範囲                                        |
| ----------------- | ------------------------------------------- |
| 今日 / today      | 過去 24 時間                                |
| 今週 / this week  | 過去 7 日                                   |
| 月次 / this month | 過去 30 日                                  |
| 過去 N 日         | `published_at > datetime('now', '-N days')` |

## 手順

### Stage 1: Collect — D1 から記事メタを取得

`tools/d1-client/recent.mjs` を Node から実行する。

引数:

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

stdout に出る JSON 形式:

```json
{
  "since": "2026-04-26T05:00:00.000Z",
  "target": "remote",
  "filters": { "category": null, "lang": null },
  "total": 42,
  "articles": [
    {
      "id": 123,
      "guid": "...",
      "feed_id": "openai-blog",
      "feed_name": "OpenAI News",
      "title": "...",
      "url": "https://...",
      "summary": "<= 500 char excerpt>",
      "author": "...",
      "published_at": "2026-04-27T...",
      "category": "ai",
      "lang": "en"
    }
  ],
  "by_category": { "ai": 12, "bigtech": 18, "jp": 12 },
  "by_feed": { "openai-blog": 3 },
  "by_lang": { "en": 30, "ja": 12 }
}
```

エラーは stderr + exit 1。`--target=remote` で 401/403 が返ったら `pnpm --filter @tnb/web exec wrangler login` を案内する。`--target=local` で記事 0 件なら、まず `pnpm migrate:local` と `pnpm dev` でローカル収集を 1 回回すよう案内する。

### Stage 2: Triage — 重要記事を選定 (quick / deep)

`articles[].summary` (≤500 字抜粋) を読み、次の基準で **重要記事 5〜10 件**を選定する:

- 大きなプロダクト / モデルローンチ (GA、GPT-N、Claude N、新フレームワーク等)
- 既存技術の breaking change / EOL / 重大な脆弱性公表
- 業界の方針転換 / 体制変更 (買収、CTO 交代、組織再編など)
- 公開時刻が新しい方を残す (同一トピックが複数記事ある場合)

選定理由を 1 行内部メモして次ステージに渡す。`total > 50` のときは category ごとに 3〜5 件まで絞る。

### Stage 3: Deep read — 本文を WebFetch で取得 (deep のみ)

Stage 2 で選定した記事の `url` を 1 件ずつ `WebFetch` で取得し、本文を読んだうえで日本語 1〜2 文の要約を生成する。

注意:

- WebFetch が失敗した記事は `summary` (≤500 字) から要約を生成し、末尾に `(summary based)` を付ける
- 同一ホストへ連続 fetch しない (rate limit 配慮、間に他ホストを挟む)
- 動画 / pdf / login wall は WebFetch せず `summary` だけで処理 (`(summary based)` 注記)

### Stage 4: Synthesize — トレンド分析 (deep / trend)

Stage 1 の全記事 (`articles`) を見渡し、タイトル + summary + (deep なら Stage 3 の本文要約) からトレンドを **意味的に** 解釈する:

- 複数記事に共通する **テーマ / プロダクト / 概念** を抽出 (頻度より関連性を優先)
- カテゴリ間 (bigtech / ai / jp) の温度差
- 一過性のニュースか継続的なトレンドか
- 各トレンド項目に関連記事のリンクを 2〜3 件添える

頻度トークン (`"llm" 5 件`、`"mcp" 3 件`…) を列挙する出力はしない。意味を読まずに語彙だけ並べる行為を禁止する。

## 出力フォーマット

Markdown で次の構造で返す。`mode` に応じて該当しない節は省略する。

```md
# Tech News Digest — <期間ラベル> (<mode>)

期間: <ISO start> 〜 <ISO end> / 総件数: <total> / カテゴリ: bigtech=N, ai=N, jp=N

## サマリ (重要記事 N 件) ← quick / deep のみ

- **[<タイトル>](url)** _(<feed_name>, <category>, <YYYY-MM-DD>)_ — <1〜2 文の日本語要約> <(summary based) があれば末尾に>
- ...

## トレンド ← deep / trend のみ

- **<テーマ>**: <意味的な解釈の 1〜2 文> 関連: [記事 A](url), [記事 B](url)
- ...

## カテゴリ別件数

| Category | 件数 |
| -------- | ---- |
| bigtech  | N    |
| ai       | N    |
| jp       | N    |
```

## ガードレール

- **PII / 機密情報**: 公開記事のみ蓄積されている前提だが、author 名以外の個人情報が混ざっていたら出力から除外する
- **D1 接続失敗時**:
  - `--target=remote` で 401/403 → `pnpm --filter @tnb/web exec wrangler login` を案内
  - `--target=local` で 0 件 → `pnpm migrate:local` + `pnpm dev` でローカル収集を 1 回回すよう案内
- **記事 0 件**: 「該当期間に記事なし」と正直に報告する。creative writing で埋めない
- **WebFetch 連続失敗**: deep モードで選定記事の半数以上が fetch 失敗したら、残りは `quick` 相当 (`(summary based)` 付き) に退避し、出力末尾に `_注: WebFetch が複数失敗したため一部 summary ベース_` を付ける

## 関連ファイル

- 実装: `tools/d1-client/recent.mjs`
- スキーマ: `migrations/0001_initial.sql` (`articles`, `feeds` テーブル)
- 型: `apps/web/worker/types.ts` (`Article`, `FeedConfig` interface)
