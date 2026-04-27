---
name: tech-news-weekly
description: 週次・月次でテック業界の動きをストーリー形式でまとめる skill。"先週のまとめ作って" "月次レポート" "週次トレンドレポート" のような問い合わせで起動する。長期トレンドの意味的テーマ抽出とニュースレター的 narrative が必要な場合に使う。
---

# tech-news-weekly

## tech-news-digest との使い分け

- **tech-news-digest**: 今日・今週・任意期間の記事を素早くリスト形式でまとめる。デイリーチェックや「何があった？」程度の確認に最適。
- **tech-news-weekly (本 skill)**: 週次・月次を「読み物」として仕上げる。テーマ別ストーリー・前週との比較・カテゴリ間の温度差分析が必要な場合に使う。

## やること

D1 (`articles` テーブル) から週次・月次の記事を取得し、意味的なテーマ抽出 + 時系列 narrative によって、ニュースレターとして成立する長さのレポートを生成する。

## 対象期間

| 入力                               | 範囲       | 選定件数  |
| ---------------------------------- | ---------- | --------- |
| 先週 / last week / weekly / 週次   | 過去 7 日  | 7〜10 件  |
| 先月 / last month / monthly / 月次 | 過去 30 日 | 12〜18 件 |

期間指定がない場合のデフォルトは **週次 (since=week)**。

## 手順

### Stage 1: Collect — D1 から記事メタを取得

`tools/d1-client/recent.mjs` を Node から実行する。

引数:

- `--since=<week|month>` (必須)
- `--target=<local|remote>` (省略時 `local`)
- `--category=<bigtech|ai|jp|zenn>` (任意)
- `--lang=<ja|en>` (任意)
- `--limit=<N>` (デフォルト 200、月次は 500 推奨)

実行例:

```sh
# 週次 (全カテゴリ)
node tools/d1-client/recent.mjs --since=week --target=remote

# 月次 (全カテゴリ、上限拡張)
node tools/d1-client/recent.mjs --since=month --target=remote --limit=500

# カテゴリ絞り込み
node tools/d1-client/recent.mjs --since=week --category=ai --target=remote
```

stdout の JSON 形式は `tech-news-digest` と同一 (`since`, `total`, `articles`, `by_category`, `by_feed`, `by_lang`)。

**URL による de-dup (Zenn 対策)**:

Stage 1 完了後、`articles` を `url` でグループ化し、重複 URL は最も古い `published_at` のものを 1 件だけ残す:

```js
const seen = new Map();
const deduped = [];
for (const a of articles.sort((x, y) => x.published_at.localeCompare(y.published_at))) {
  if (!seen.has(a.url)) {
    seen.set(a.url, true);
    deduped.push(a);
  }
}
```

de-dup 後の件数をレポート冒頭の期間ヘッダに反映する。

エラーハンドリング:

- `--target=remote` で 401/403 → `pnpm --filter @tnb/web exec wrangler login` を案内
- `--target=local` で 0 件 → `pnpm migrate:local` + `pnpm dev` でローカル収集を 1 回回すよう案内

### Stage 2: Triage — 重要記事の選定

`articles[].summary` (≤500 字抜粋) を読み、週次・月次のレポートに値する記事を選定する。

選定基準 (優先度順):

1. **インパクト**: 大きなプロダクト・モデルローンチ (GA、GPT-N、Claude N、新フレームワーク等)
2. **変化の大きさ**: breaking change / EOL / 重大な脆弱性 / 業界方針転換 (買収、組織再編)
3. **継続性**: 前週・前月から続くトレンドの節目となる記事
4. **多様性**: 同一テーマが集中しないようカテゴリ・ホスト横断でバランスを取る

選定件数:

- 週次: 7〜10 件
- 月次: 12〜18 件
- `total > 100` の場合は category ごとに上限を設けてからマージする

**webfetch_blocklist** — 以下のホストは Stage 3 の WebFetch 対象から除外し、`summary` ベースで処理する (`(summary based)` を付記):

| ホスト       | 理由                                             |
| ------------ | ------------------------------------------------ |
| `openai.com` | Cloudflare Bot Management により WebFetch が 403 |
| `medium.com` | paywall / ログイン wall で本文取得不可           |

### Stage 3: Deep read — 本文を WebFetch で取得

Stage 2 で選定した記事の `url` を WebFetch で取得し、日本語 1〜2 文の要約を生成する。

**同一ホストへの連続 fetch は行わない**。ホスト別にバッチを組み、各バッチを並列 fetch し、バッチ間では別ホストのバッチを挟む:

```
バッチ計画例 (3 ホスト、各 2 記事):
  batch[github.com]   → batch[zenn.dev]   → batch[aws.amazon.com]
  ↓ parallel          ↓ parallel           ↓ parallel
  [gh-1, gh-2]        [zenn-1, zenn-2]     [aws-1, aws-2]
```

注意:

- WebFetch が失敗した記事は `summary` から要約し末尾に `(summary based)` を付ける
- 動画 / PDF / login wall は WebFetch せず `summary` で処理
- deep モードで選定記事の半数以上が fetch 失敗したら、出力末尾に `_注: WebFetch が複数失敗したため一部 summary ベース_` を付ける

### Stage 4: テーマ抽出 + 時系列 narrative 生成

Stage 1 の全記事 (de-dup 後) と Stage 3 の本文要約を総合して、読み物として成立するレポートを生成する。

#### 意味的テーマ抽出

カテゴリ横断で「業界の動き」を意味的に解釈し、**3〜5 個の主要トピック**を抽出する。

ルール:

- 語彙頻度 (`"llm" 5 件` 等) を機械的に列挙しない — 意味を読む
- 一過性のニュースか継続的なトレンドかを区別する
- カテゴリ間 (bigtech / ai / jp / zenn) の温度差を意識する

#### 時系列 narrative

各トピックについて「先週・先月何が起きたか」をストーリー形式で書く。

- 各トピックは 2〜4 段落
- 関連記事リンクをストーリー内に自然に埋め込む
- 起きたことの羅列でなく、**文脈 → 変化 → 意味** の流れで書く
- 月次の場合は「今月全体の変化の方向性」にも言及する

## 出力フォーマット

```md
# Weekly Tech News — <YYYY-MM-DD> 〜 <YYYY-MM-DD>

<!-- 月次の場合: # Monthly Tech News — <YYYY-MM> -->

期間: <ISO start> 〜 <ISO end> / 総件数 (de-dup 後): <total> / カテゴリ: bigtech=N, ai=N, jp=N, zenn=N

## 今週の主要トピック

<!-- 月次の場合: ## 今月の主要トピック -->

### <トピック名 1>

<2〜4 段落のストーリー。関連記事を [タイトル](url) 形式で自然に埋め込む>

### <トピック名 2>

<同上>

<!-- 3〜5 個のトピックを並べる -->

## カテゴリ別ハイライト

### bigtech

- <ハイライト 1> ([記事タイトル](url), <YYYY-MM-DD>)
- <ハイライト 2>
- <ハイライト 3>

### ai

- <ハイライト 1>
- ...

### jp

- <ハイライト 1>
- ...

### zenn

- <ハイライト 1>
- ...

## 注目記事ピックアップ

- **[<タイトル>](url)** _(<feed_name>, <YYYY-MM-DD>)_: <1〜2 文の要約> <(summary based) があれば末尾に>
- ...

## カテゴリ別件数

| Category | 件数 |
| -------- | ---- |
| bigtech  | N    |
| ai       | N    |
| jp       | N    |
| zenn     | N    |
```

各セクションを省略しない。記事 0 件のカテゴリは「記事なし」と記載する。

## ガードレール

- **PII / 機密情報**: author 名以外の個人情報が混ざっていたら出力から除外する
- **記事 0 件**: 「該当期間に記事なし」と正直に報告し、creative writing で埋めない
- **D1 接続失敗**:
  - `--target=remote` で 401/403 → `pnpm --filter @tnb/web exec wrangler login` を案内
  - `--target=local` で 0 件 → `pnpm migrate:local` + `pnpm dev` でローカル収集を 1 回回すよう案内
- **today / 今日 と言われた場合**: 本 skill は週次・月次専用。`tech-news-digest` を使うよう案内する

## 関連ファイル

- 実装: `tools/d1-client/recent.mjs`
- スキーマ: `migrations/0001_initial.sql` (`articles`, `feeds` テーブル)
- 型: `apps/web/worker/types.ts` (`Article`, `FeedConfig` interface)
- 参考: `.claude/skills/tech-news-digest/SKILL.md` (デイリーダイジェスト skill)
