---
paths:
  - "apps/web/worker/db/**/*.ts"
  - "migrations/**/*.sql"
---

# D1 / SQLite / SQL 規約 (2026 年版)

D1 は SQLite ベース。SQLite の制約 + Cloudflare の per-query CPU 50ms / 1 req 10ms の上限を意識する。

## マイグレーション

- 配置: ルートの `migrations/<NNNN>_<snake_case_summary>.sql`
- 連番は 4 桁 zero-pad (`0001_`, `0010_`, `0100_`)。**既存番号を変更しない**。新しいマイグレーションは末尾追加のみ
- 1 ファイルに複数の `CREATE / ALTER` を入れて OK だが、**論理単位で分ける** (1 機能 1 ファイル)
- `IF NOT EXISTS` / `IF EXISTS` を必ず付ける (再適用安全のため)
- DROP 系は最小限。本番でデータ消失するため、まず ALTER + 移行スクリプトを検討
- マイグレーション適用前に必ずローカル (`pnpm migrate:local`) で確認 → PR レビュー → 本番適用

## SQL の書き方

- SQL は **大文字キーワード** (`SELECT`, `FROM`, `WHERE`, `ORDER BY`, `LIMIT`)
- 識別子 (テーブル / カラム) は **snake_case**
- 文字列は single quote (`'foo'`)、識別子のクォートは double quote (`"published_at"`) — ただし予約語と衝突しなければ無くて OK
- インデント: 句で改行する読みやすい形式

  ```sql
  SELECT a.id, a.title, a.published_at
  FROM articles AS a
  WHERE a.feed_id = ?
    AND a.published_at > datetime('now', '-30 days')
  ORDER BY a.published_at DESC
  LIMIT 30;
  ```

## prepared statement と bind

- ユーザー入力は **必ず** placeholder (`?`) で bind。文字列連結 SQL は禁止 (SQL injection)
- 同じ SQL 文字列を再利用すると Cloudflare の statement キャッシュに乗る。動的 SQL を組み立てる時はパターン数を有限に保つ:

  ```ts
  // ✓ 良い: SQL の形が 1 種類しかない (キャッシュヒット率が高い)
  const stmt = env.DB.prepare("SELECT * FROM articles WHERE category = ? LIMIT ?");

  // ✗ 悪い: filter ごとに SQL が生まれてキャッシュが効かない
  const stmt = env.DB.prepare(`SELECT * FROM articles WHERE category = '${cat}' LIMIT ${n}`);
  ```

## batch / transaction

- D1 は明示 `BEGIN/COMMIT` ではなく `db.batch([stmt1, stmt2])` がトランザクション境界
- `batch` 内の任意のステートメントが失敗すると全体ロールバック
- collector が記事を bulk insert する時は `INSERT OR IGNORE INTO articles (...) VALUES (?, ?, ?)` を `batch` で 100 件単位

## index 設計

- 以下の使用頻度の高いクエリにインデックスを作る:
  - `WHERE published_at > ? ORDER BY published_at DESC` → `idx_articles_published_at`
  - `WHERE feed_id = ? ORDER BY published_at DESC` → `idx_articles_feed_published`
  - `WHERE category = ? AND published_at > ?` → `idx_articles_category_published` (`migrations/0004_compound_index.sql` 参照)
- 複合 index は **最も絞り込めるカラム** を先頭に
- index 過多は writes を遅くする。`EXPLAIN QUERY PLAN <query>` でローカル確認してから追加

## FTS5 全文検索

- `articles_fts` は trigram tokenizer 構成 (`migrations/0003_fts5_trigram.sql`)
- INSERT / DELETE / UPDATE トリガで `articles` と自動同期
- 検索クエリ: `SELECT * FROM articles_fts WHERE articles_fts MATCH ? ORDER BY rank LIMIT 30`
- MATCH 演算子の引数は **クォートで括る** (`"AI agent"` のようにフレーズ検索)

## NULL / 空文字 / デフォルト

- D1 は SQLite なので NULL / "" の区別がきつくない。**意味的に違うなら明示する**
- `summary` が無い記事は NULL にする (空文字でなく)
- `created_at` / `updated_at` は `DEFAULT (datetime('now'))` を使う
- boolean は `INTEGER` (0/1)。TS 側で `Boolean(row.is_active)` で narrow

## 日時

- D1 / SQLite は ISO 8601 文字列 (`'2026-04-29T10:00:00Z'`) で扱う
- 比較は `datetime('now', '-7 days')` のような関数で生成
- アプリ側で渡す時は必ず UTC (`new Date().toISOString()`)。タイムゾーン混在を避ける

## D1 アクセス層 (`apps/web/worker/db/`)

- ファイル単位: `articles.ts` (read/write)、`feeds.ts`、`stats.ts`、`migrations.ts` (initial seed)
- 各関数は `env: Env` を引数で受ける (DI)。グローバル state を持たない
- 戻り値は domain 型 (`Article`, `Feed`)。`Row` 型 (DB rawレベル) は内部でのみ使い export しない
- 大量の rows を返す関数は generator (`async function*`) または cursor 引数を取る形にする (メモリ節約)

## 型と D1Result

- `db.prepare(...).first<T>()` の `T` は domain 型。null チェックを必ず:

  ```ts
  const row = await env.DB.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first<Article>();
  if (!row) return { status: "not_found" };
  ```

- `db.prepare(...).all<T>()` は `{ results: T[], success, meta }`。`results` を取り出して使う
- writes は `db.prepare(...).run()` の戻り値 `meta.changes` で affected row 数を確認できる
