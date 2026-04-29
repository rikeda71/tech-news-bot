---
name: test-design
description: テスト設計と TDD のガイダンス。テストを書く前の設計、書かれたテストのレビュー、古典学派 (classical / Detroit school) 観点でのモック過剰の指摘などに使う。t-wada (和田卓人) のテスト哲学をベースとし、本プロジェクトの worker / client / e2e の 3 層構造に整合させた指針を提供する。
allowed-tools: Read, Grep, Glob, Bash
---

# テスト設計 Skill (t-wada inspired)

新しいテストを書く前の **設計レビュー** と、書かれたテストの **品質チェック** を支援する。本プロジェクトの古典学派方針 (`.claude/rules/20-testing-overview.md`) に整合させた具体的な指針を提供する。

## いつ起動するか

ユーザーから次のような依頼があったとき:

- 「この機能のテストを設計して」「テストの分割粒度をレビューして」
- 「TDD で進めたい」
- 「テストが壊れやすいので見直したい」
- 「subagent / 並行作業者が書いたテストをレビューしたい」(その場合は `code-reviewer` agent も参照)

## 基本原則

### 1. TDD: Red → Green → Refactor

1. **Red**: まず失敗するテストを書く。assertion は「最終的にこうなっていてほしい」を 1 つだけ書く
2. **Green**: 通る最小コードを書く。**汚くて良い**。重複・ハードコードも一旦許容
3. **Refactor**: テストが緑のまま実装をきれいにする。テスト自体もリファクタ対象

> 「テストがないコードはレガシーコード」 — マイケル・フェザーズ
> 「テスト容易性 = 設計品質」 — t-wada

新規実装で「テストが書きにくい」と感じたら、設計を疑う。引数が多すぎる / 副作用が散在している / 純関数に切り出せる箇所を見落としている、のいずれか。

### 2. AAA パターン (Arrange / Act / Assert)

```ts
it("GET /api/articles は category で絞り込める", async () => {
  // Arrange: 前提状態を作る
  await env.DB.batch([
    env.DB.prepare("INSERT INTO articles (...) VALUES (?, ?, ?)").bind(/* bigtech */),
    env.DB.prepare("INSERT INTO articles (...) VALUES (?, ?, ?)").bind(/* ai */),
  ]);

  // Act: テスト対象を実行
  const res = await SELF.fetch("https://x.test/api/articles?category=bigtech");

  // Assert: 結果を検証
  expect(res.status).toBe(200);
  const body = await res.json<{ articles: Article[] }>();
  expect(body.articles).toHaveLength(1);
  expect(body.articles[0].category).toBe("bigtech");
});
```

**1 テスト 1 振る舞い**。複数を assert したくなったら別 `it` に分ける。

### 3. F.I.R.S.T. 原則

| 原則                | 意味                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| **F**ast            | 速い。1 テスト 100ms 以下を目標。遅いものは別レイヤ (e2e) に逃がす   |
| **I**ndependent     | 独立。`reset()` + `applyD1Migrations` が毎回走る前提なので順序非依存 |
| **R**epeatable      | 何度走らせても同じ結果。時刻 / 乱数 / 外部 fetch は固定              |
| **S**elf-validating | 自動判定。`console.log` で目視確認は禁止 (デバッグ時のみ)            |
| **T**imely          | 実装と同時 (TDD なら先) に書く。後付けは粒度が荒くなりがち           |

### 4. 古典学派 (classical school) のスタンス

詳細は `.claude/rules/20-testing-overview.md` の「テスト学派」セクション。要点:

- **実物を使う**: D1 (`env.DB`) / DOM (happy-dom) / Hono Worker (`SELF.fetch`)
- **境界でのみモック**: 外部 fetch / 時刻 / 乱数
- **assert は state**: 「D1 の中身がこう」「画面にこれが見える」「レスポンスがこう」
- **interaction 検証は控えめ**: `expect(spy).toHaveBeenCalledTimes(1)` だけのテストは弱い。それで何が起きたかも見る

## 設計レビューのチェックリスト

新規テストを書くとき / 書かれたテストをレビューするときに使う。

### A. 命名

- [ ] **テスト名は仕様**: 「〜のとき、〜が〜になる」「〜は〜できる」の形式。日本語可
- [ ] 実装名 (`articleService.test.ts` の `it("createArticle should work")`) ではなく **振る舞い** で書く
- [ ] ✅ `it("検索クエリが空の場合、最新記事を返す")`
- [ ] ❌ `it("works correctly")` / `it("test 1")`

### B. 粒度

- [ ] 1 `it` で assert する振る舞いは 1 つ。3 つ以上 assert があるなら分割を検討
- [ ] ただし「同じ Arrange の確認系」(レスポンス body の構造を 3 行 assert する等) は 1 it で OK
- [ ] `describe` のネストは 2 階層まで。深くなったら別ファイルに切り出す

### C. assertion の具体性

- [ ] ❌ `expect(result).toBeTruthy()` / `expect(result).toBeDefined()`
- [ ] ✅ `expect(result).toEqual({ status: "ok", saved: 3 })`
- [ ] 配列は length だけでなく中身も見る (`toMatchObject([...])`)
- [ ] エラーは型 + メッセージ両方: `expect(() => ...).toThrow(/timeout/)`

### D. 独立性

- [ ] 別テストの状態に依存していないか (順序を変えて通るか)
- [ ] グローバル変数 / module-level state を書き換えていないか
- [ ] `vi.useFakeTimers()` の後始末を `afterEach` で `vi.useRealTimers()` しているか

### E. モック過剰の検出 (古典派)

🚨 これらが見えたら設計に立ち戻る:

- [ ] `vi.mock("../db/articles")` のような **内部モジュール mock**
- [ ] `vi.spyOn(repository, "find")` で repository を mock
- [ ] テストが「呼び出された回数」だけを assert
- [ ] mock の振る舞い定義 (`mockResolvedValue(...)`) がテスト本体より長い
- [ ] テストファイルの 1/3 以上が setup / mock 構築

→ 解決策: **実物を使えるレイヤまで mock を後退させる** (e.g. fetch だけ mock)

### F. flaky 対策

- [ ] 時刻依存: `vi.setSystemTime(new Date("2026-04-29T00:00:00Z"))` で固定
- [ ] 並列処理: `await` を漏らしていないか
- [ ] sort 順: D1 の SELECT は `ORDER BY` を明示しないと順序が不定
- [ ] retry でごまかしていないか (Playwright の `retries: 2` は CI 限定の保険)

### G. 何をテストしないか

- [ ] サードパーティのライブラリ自体 (Hono / React の挙動)
- [ ] 設定ファイルの値そのもの (`feeds.yaml` の id 一覧など)
- [ ] private な実装詳細 (内部 helper の引数形)
- [ ] 「コードカバレッジ稼ぎ」のためだけのテスト

## レビュー時のフレーズ

subagent / 並行作業者の出力をレビューする際の指摘テンプレ:

- 「このテストは内部実装を mock しています。古典派の方針 (`.claude/rules/20-testing-overview.md`) に従い、実物の `env.DB` で書き換えてください」
- 「assertion が `toBeTruthy()` のみで弱いです。期待する具体的な値で `toEqual` してください」
- 「テスト名が `should work` で振る舞いが分かりません。「〜のとき〜になる」形式に変えてください」
- 「1 つの it で 5 種類の振る舞いを検証しています。AAA で見て Arrange が共通でない箇所は分割してください」
- 「flaky の温床になります: `Date.now()` を直接使っているので `vi.setSystemTime` で固定してください」

## 設計フローの例 (新規 endpoint)

ユーザー: 「`/api/articles/:id/related` を作って」

1. **どんな振る舞いを保証するか書き出す**:
   - id が存在する → 関連記事 N 件返す
   - id が存在しない → 404
   - 関連が 0 件 → 空配列 + 200
   - limit クエリで件数制限できる
2. **テストを先に書く** (Red):
   - `tests/worker/api/related.test.ts` に上記 4 ケースを `it` で並べる
   - 共通 seed は `beforeEach`
3. **最小実装で通す** (Green): ハードコード OK
4. **リファクタ** (Refactor): db helper に抽出 / 型を整える
5. **エッジケースを足す**: 削除済み記事の扱い、自分自身を除外、など

## 関連

- `.claude/rules/20-testing-overview.md` … 3 層テスト構造、古典派、共通の心得
- `.claude/rules/21-testing-worker.md` … worker / API / D1 / collector の具体例
- `.claude/rules/22-testing-client.md` … React / RTL の具体例
- `.claude/rules/23-testing-e2e.md` … Playwright のベストプラクティス
- `.claude/agents/code-reviewer.md` … 並行作業者のコード品質レビュー
