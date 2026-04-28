---
name: tech-news-digest
description: D1 に蓄積された tech blog の記事を「今日 / 今週 / 任意期間」の粒度で抽出し、Stage 1〜4 (収集 → 選定 → WebFetch で本文取得 → トレンド分析) で日本語ダイジェストを生成する。"今日のニュースまとめて" "週次サマリ作って" "最近のトレンド何？" のような問い合わせで起動する。要約品質を本文ベースで保つため、デフォルトで WebFetch を使う deep モードで動作する。
---

# tech-news-digest

## 他の skill との使い分け

- **tech-news-digest (本 skill)**: 今日・今週・任意期間の記事を素早くリスト形式でまとめる。デイリーチェックや「何があった？」程度の確認に最適。
- **tech-news-weekly**: 週次・月次を「読み物」として仕上げる。テーマ別ストーリー・前週との比較・カテゴリ間の温度差分析が必要な場合はそちらを使う。
- **tech-news-search**: 特定キーワードで深掘り検索。「MCP の最近の話題は？」のようなキーワード絞り込みにはこちら。
- **tech-news-related**: ピボット記事 1 本を起点に関連記事を D1 から探して関係性・文脈マップを生成する。「この記事に関連する記事を教えて」のような問い合わせにはこちら。
- **tech-news-summary**: 1 つの記事 URL を深く読む。ダイジェストで気になった記事を「もっと詳しく」読みたい場合はこちら。

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
- `--category=<bigtech|ai|jp|zenn>` (任意)
- `--lang=<ja|en>` (任意)
- `--limit=<N>` (デフォルト 200)

実行例:

```sh
node tools/d1-client/recent.mjs --since=today --target=remote
node tools/d1-client/recent.mjs --since=week --category=ai --target=remote
node tools/d1-client/recent.mjs --since=week --category=zenn --target=remote
```

stdout に出る JSON 形式:

```json
{
  "since": "2026-04-26T05:00:00.000Z",
  "target": "remote",
  "filters": { "category": null, "lang": null },
  "total": 48,
  "deduped_total": 42,
  "articles": [
    {
      "id": 123,
      "guid": "...",
      "feed_id": "zenn-trending",
      "feed_name": "Zenn トレンド",
      "title": "...",
      "url": "https://zenn.dev/...",
      "summary": "<= 500 char excerpt>",
      "author": "...",
      "published_at": "2026-04-27T...",
      "category": "zenn",
      "lang": "ja"
    }
  ],
  "by_category": { "ai": 12, "bigtech": 18, "jp": 8, "zenn": 4 },
  "by_feed": { "zenn-trending": 3 },
  "by_lang": { "en": 30, "ja": 12 }
}
```

**URL による de-dup (Zenn 対策)**:

`recent.mjs` は v1.1 以降、de-dup 済みの `articles` を返す。出力 JSON の `deduped_total` フィールドが de-dup 後の件数、`total` が元の件数。以降のすべてのステージでは `articles` (de-dup 済み) をそのまま使えばよい。

`deduped_total` を `## カテゴリ別件数` の「総件数」として表示する。`total` と差がある場合は `(de-dup 前: N)` と注記する。

エラーは stderr + exit 1。`--target=remote` で 401/403 が返ったら `pnpm --filter @tnb/web exec wrangler login` を案内する。`--target=local` で記事 0 件なら、まず `pnpm migrate:local` と `pnpm dev` でローカル収集を 1 回回すよう案内する。

### Stage 2: Triage — 重要記事を選定 (quick / deep)

`articles[].summary` (≤500 字抜粋) を読み、次の基準で **重要記事 5〜10 件**を選定する:

- 大きなプロダクト / モデルローンチ (GA、GPT-N、Claude N、新フレームワーク等)
- 既存技術の breaking change / EOL / 重大な脆弱性公表
- 業界の方針転換 / 体制変更 (買収、CTO 交代、組織再編など)
- 公開時刻が新しい方を残す (同一トピックが複数記事ある場合)

選定理由を 1 行内部メモして次ステージに渡す。`deduped_total > 50` のときは category ごとに 3〜5 件まで絞る。さらに **同一フィード (feed_id) からは 3 件まで** に制限する。特定フィードが大量記事を出している日 (例: google-developers が 20 件/日) でも特定フィードに偏らないようにするため。

**webfetch_blocklist** — 以下のホストは WebFetch をスキップする (Stage 4 トレンド分析には引き続き含める):

| ホスト       | 理由                                             |
| ------------ | ------------------------------------------------ |
| `openai.com` | Cloudflare Bot Management により WebFetch が 403 |
| `medium.com` | paywall / ログイン wall で本文取得不可           |

除外判定は `new URL(article.url).hostname` で行う。blocklist ホストの記事は Stage 3 をスキップして `summary` (≤500 字) から要約を生成し、`(summary based)` を末尾に付けて出力に含める。「除外」は WebFetch のみ除外であり、出力から除くわけではない。

### Stage 3: Deep read — 本文を WebFetch で取得 (deep のみ)

Stage 2 で選定した記事の `url` を WebFetch で取得し、本文を読んだうえで日本語 1〜2 文の要約を生成する。

**同一ホストへの連続 fetch は行わない**。ホスト別にバッチを組み、各バッチ内では parallel fetch し、バッチ間では別ホストのバッチを挟む順序で実行する:

```
バッチ計画例 (3 ホスト、各 2 記事):
  batch[github.com]   → batch[zenn.dev]   → batch[aws.amazon.com]
  ↓ parallel          ↓ parallel           ↓ parallel
  [gh-1, gh-2]        [zenn-1, zenn-2]     [aws-1, aws-2]
```

注意:

- WebFetch が失敗した記事は `summary` (≤500 字) から要約を生成し、末尾に `(summary based)` を付ける
- 動画 / pdf / login wall は WebFetch せず `summary` だけで処理 (`(summary based)` 注記)

### Stage 4: Synthesize — トレンド分析 (deep / trend)

Stage 1 の全記事 (`articles`、Stage 1 の de-dup 後) を見渡し、タイトル + summary + (deep なら Stage 3 の本文要約) からトレンドを **意味的に** 解釈する。

**横断トレンド**: カテゴリ横断で共通するテーマ / プロダクト / 概念を抽出 (頻度より関連性を優先)。

**カテゴリ別ハイライト** (bigtech / ai / jp / zenn): 各カテゴリの特徴的な動きや話題を 2〜3 点まとめる。カテゴリの記事が 0 件のときは「記事なし」と書く。

分析視点:

- 一過性のニュースか継続的なトレンドか
- カテゴリ間 (bigtech / ai / jp / zenn) の温度差
- 各トレンド項目に関連記事のリンクを 2〜3 件添える

頻度トークン (`"llm" 5 件`、`"mcp" 3 件`…) を列挙する出力はしない。意味を読まずに語彙だけ並べる行為を禁止する。

## 出力フォーマット

Markdown で次の構造で返す。`mode` に応じて該当しない節は省略する。

```md
# Tech News Digest — <期間ラベル> (<mode>)

期間: <ISO start> 〜 <ISO end> / 総件数 (de-dup 後): <deduped_total> / カテゴリ: bigtech=N, ai=N, jp=N, zenn=N

## サマリ (重要記事 N 件) ← quick / deep のみ

- **[<タイトル>](url)** _(<feed_name>, <category>, <YYYY-MM-DD>)_ — <1〜2 文の日本語要約> <(summary based) があれば末尾に>
- ...

## トレンド (横断) ← deep / trend のみ

- **<テーマ>**: <意味的な解釈の 1〜2 文> 関連: [記事 A](url), [記事 B](url)
- ...

## カテゴリ別ハイライト ← deep / trend のみ

### bigtech

- <ハイライト 1>
- ...

### ai

- <ハイライト 1>
- ...

### jp

- <ハイライト 1>
- ...

### zenn

- <ハイライト 1>
- ...

## カテゴリ別件数

| Category | 件数 |
| -------- | ---- |
| bigtech  | N    |
| ai       | N    |
| jp       | N    |
| zenn     | N    |
```

## ガードレール

- **PII / 機密情報**: 公開記事のみ蓄積されている前提だが、author 名以外の個人情報が混ざっていたら出力から除外する
- **D1 接続失敗時**:
  - `--target=remote` で 401/403 → `pnpm --filter @tnb/web exec wrangler login` を案内
  - `--target=local` で 0 件 → `pnpm migrate:local` + `pnpm dev` でローカル収集を 1 回回すよう案内
- **記事 0 件**: 「該当期間に記事なし」と正直に報告する。creative writing で埋めない
- **WebFetch 連続失敗**: deep モードで選定記事の半数以上が fetch 失敗したら、残りは `quick` 相当 (`(summary based)` 付き) に退避し、出力末尾に `_注: WebFetch が複数失敗したため一部 summary ベース_` を付ける

## 評価

skill の出力品質を再現性のある指標で測定するためのフレームワークを整備している。

- **評価指標の定義・測定方法**: [EVALUATION.md](./EVALUATION.md)
- **実行ログ (結果記録)**: [runs.md](./runs.md)

主な評価指標:

| 指標                        | 種別 | 許容範囲       |
| --------------------------- | ---- | -------------- |
| 重要記事選定の再現率        | 客観 | 0.6 以上       |
| 要約の事実整合性            | 主観 | 平均 1.5 / 2.0 |
| トレンド抽出の意味性        | 主観 | 3 / 5 以上     |
| WebFetch 失敗率             | 客観 | 0.3 未満       |
| 同一ホスト連続 fetch 違反数 | 客観 | 0 件           |

skill を実行したら `runs.md` に結果を追記し、指標が退行していれば EVALUATION.md の「チューニング優先度の目安」を参照して SKILL.md を修正する。

## 関連ファイル

- 実装: `tools/d1-client/recent.mjs`
- スキーマ: `migrations/0001_initial.sql` (`articles`, `feeds` テーブル)
- 型: `apps/web/worker/types.ts` (`Article`, `FeedConfig` interface)
- 評価指標: `.claude/skills/tech-news-digest/EVALUATION.md`
- 実行ログ: `.claude/skills/tech-news-digest/runs.md`
- 関連 skill: `.claude/skills/tech-news-weekly/SKILL.md` (週次・月次レポート)
- 関連 skill: `.claude/skills/tech-news-search/SKILL.md` (キーワード深掘り検索)
