---
name: tech-news-summary
description: 単一の記事 URL を受け取り、本文を WebFetch で取得して構造化された日本語要約を返す skill。"この URL 要約して" "この記事を詳しく読みたい" "この記事の内容教えて" のように特定記事を深く読みたい時に起動する。メタ情報・TL;DR・要点・技術的詳細・著者の主張・関連記事を含む Markdown を生成する。
---

# tech-news-summary

## 他の skill との使い分け

- **tech-news-digest**: 今日・今週・任意期間の記事を素早くリスト形式でまとめる。「今日のニュースまとめて」のような期間ベースの俯瞰にはこちら。
- **tech-news-weekly**: 週次・月次を「読み物」として仕上げる。ニュースレター的 narrative が必要な場合はこちら。
- **tech-news-search**: 特定キーワードで D1 の記事を深掘り検索する。「MCP の最近の話題は？」のようなキーワード絞り込みにはこちら。
- **tech-news-summary (本 skill)**: 1 つの記事 URL を渡して本文ベースで深く要約する。ダイジェストで見かけた記事を「もっと詳しく」読みたい場合に使う。

## やること

ユーザーから渡された URL の記事本文を WebFetch で取得し、構造化された日本語要約を生成する。関連記事を D1 から補足的に提示する。

## 入力

- **URL** (必須): 記事ページの URL
- **mode** (任意): `brief` または `detailed` (デフォルト `detailed`)
  - `brief`: TL;DR と要点のみ (短時間で把握したい場合)
  - `detailed`: 全セクション出力

## 手順

### Step 1: URL の事前チェック

以下に該当する場合は WebFetch せず、ユーザーに通知して終了する:

- URL が動画サービス (YouTube, Vimeo, etc.) を指している
- URL の末尾が `.pdf`、または Content-Type が `application/pdf` と推定される
- URL が明らかにログインウォール・社内ドキュメント (例: `app.notion.so`, `docs.google.com` の共有制限付き, `confluence.*`, `jira.*`)

通知文例:

> この URL は [動画 / PDF / 要認証ページ] のため本文を取得できません。公開 Web 記事の URL を渡してください。

### Step 2: blocklist チェック → D1 フォールバック

`new URL(url).hostname` が以下の **webfetch_blocklist** に含まれる場合、WebFetch をスキップする:

| ホスト       | 理由                                             |
| ------------ | ------------------------------------------------ |
| `openai.com` | Cloudflare Bot Management により WebFetch が 403 |
| `medium.com` | paywall / ログイン wall で本文取得不可           |

blocklist に該当した場合の処理:

1. `tools/d1-client/recent.mjs --since=month --target=remote` を実行し、`articles[].url` が入力 URL と一致するものを探す
2. 見つかった場合: その `summary` (≤500 字抜粋) を元に要約を生成し、出力に `(D1 summary ベース — WebFetch ブロック対象ホスト)` を付記する
3. 見つからなかった場合: ユーザーに正直に報告して終了する

   > このホスト (`openai.com` / `medium.com`) は WebFetch がブロックされており、D1 にも該当記事が見つかりませんでした。記事の内容を要約できません。

### Step 3: WebFetch で本文取得

Step 1・Step 2 のチェックを通過した場合、WebFetch で URL を取得する。

- 失敗 (タイムアウト、403、404 等) した場合は **再試行せず**、エラー内容をユーザーに報告して終了する
- 取得できた場合は本文テキストを Step 4 に渡す

### Step 4: 構造化要約の生成

取得した本文 (または D1 summary) から以下の構造で要約を生成する。

`mode=brief` の場合は「TL;DR」と「要点」のみ出力し、他のセクションは省略する。

`mode=detailed` (デフォルト) の場合は全セクションを出力する:

1. **メタ情報**: タイトル、著者、公開日 (本文から推定)、ソース (ホスト名)
2. **TL;DR** (3 行以内): 記事全体を 3 行で要約
3. **要点** (5〜8 個の bullet): 記事の核となる主張・情報を bullet で列挙
4. **技術的詳細** (技術記事の場合のみ): 数値・ベンチマーク・アーキテクチャ・実装の詳細を言語化する。技術的詳細がない (ニュース・意見記事等) 場合はこのセクションを省略する
5. **著者の主張と根拠**: 著者が何を主張し、どんな根拠を示しているかを整理する
6. **コメント / 注意点 / 関連性**: 記事の信頼性・前提・注意すべき点、および D1 関連記事 (Step 5 で取得)

### Step 5: 関連記事の検索 (detailed モードのみ)

元記事のタイトルまたは `summary` から主要キーワードを 1〜2 個抽出し、`tools/d1-client/search.mjs` で D1 を検索する:

```sh
node tools/d1-client/search.mjs --q=<keyword> --since=month --target=remote
```

選定基準:

- 元記事と URL が異なる
- 元記事とタイトルが一致しない (同一記事の重複を除く)

条件を満たす記事が見つかれば 1〜3 件を「コメント / 注意点 / 関連性」セクションに含める。

**フォールバック**: `search.mjs` でヒットしない場合のみ、`tools/d1-client/recent.mjs --since=month --target=remote` で全件取得して in-memory キーワード一致で再検索する。それでも見つからなければ「関連記事なし」と記載する。

## 出力フォーマット

### brief モード

```md
# [<タイトル>](<元記事 URL>)

_<著者> / <公開日> / <ソース>_

## TL;DR

<3 行以内の要約>

## 要点

- <要点 1>
- <要点 2>
- ...（5〜8 個）

---

_元記事: <URL>_
```

### detailed モード

```md
# [<タイトル>](<元記事 URL>)

_<著者> / <公開日> / <ソース>_

## TL;DR

<3 行以内の要約>

## 要点

- <要点 1>
- <要点 2>
- ...（5〜8 個）

## 技術的詳細

<!-- 技術記事の場合のみ。数値・ベンチマーク・アーキテクチャなどを言語化 -->
<!-- 技術的詳細がない場合はこのセクションを省略 -->

## 著者の主張と根拠

<著者が何を主張し、どんな根拠を示しているかの整理>

## コメント / 注意点 / 関連性

<記事の信頼性・前提・注意点>

**関連記事 (D1 より)**:

- **[<タイトル>](url)** _(<feed_name>, <YYYY-MM-DD>)_ — <1 文の補足>
- ...（1〜3 件。なければ「関連記事なし」）

---

_元記事: <URL>_ <(D1 summary ベース — WebFetch ブロック対象ホスト) があれば付記>
```

## ガードレール

- **動画 / PDF / login wall**: WebFetch せずユーザーに通知して終了する (Step 1 参照)
- **blocklist ホスト**: WebFetch をスキップし D1 フォールバックを試みる (Step 2 参照)
- **WebFetch 失敗**: 再試行せず、エラーをそのままユーザーに報告して終了する
- **公開記事のみ対象**: 社内ドキュメント・要認証ページは扱わない
- **本文のコピペ転載禁止**: 常に要約・言語化した文章を返す。原文を長々と貼り付けない
- **PII**: author 名以外の個人情報が本文に含まれていたら出力から除外する
- **著作権への配慮**: 本文の一字一句のコピーは行わず、必ず自分の言葉で要約する

## 関連ファイル

- D1 検索: `tools/d1-client/search.mjs` (関連記事検索 — Step 5 のメイン)
- D1 フォールバック: `tools/d1-client/recent.mjs` (search.mjs ヒットなし時の全件フォールバック・D1 フォールバック)
- スキーマ: `migrations/0001_initial.sql` (`articles`, `feeds` テーブル)
- 型: `apps/web/worker/types.ts` (`Article`, `FeedConfig` interface)
- 関連 skill: `.claude/skills/tech-news-digest/SKILL.md` (期間ベースのダイジェスト)
- 関連 skill: `.claude/skills/tech-news-search/SKILL.md` (キーワード深掘り検索)
- 関連 skill: `.claude/skills/tech-news-weekly/SKILL.md` (週次・月次レポート)
