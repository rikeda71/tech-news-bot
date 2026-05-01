-- 初期スキーマ (PoC リセット後の最終形)
--
-- 過去の 0001-0011 の経緯 (zenn カテゴリ追加 → 廃止、FTS5 unicode61 → trigram、
-- feeds カラム追加など) を整理して、最終的な schema を 1 ファイルで定義する。
-- 本番 D1 を削除して新規作成する前提で、中間の ALTER / DROP は含めない。

-- ---------------------------------------------------------------------------
-- feeds: feeds.yaml をミラーリングし、収集状態を保持する
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS feeds (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  url                   TEXT NOT NULL,
  category              TEXT NOT NULL CHECK (category IN ('bigtech', 'ai', 'jp', 'personal')),
  lang                  TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('ja', 'en')),
  enabled               INTEGER NOT NULL DEFAULT 1,
  last_fetched_at       TEXT,
  last_status           TEXT,
  last_error            TEXT,
  created_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at            TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- conditional GET 用 (ETag / Last-Modified)
  last_etag             TEXT,
  last_modified         TEXT,
  -- 連続失敗回数 (成功時に 0、失敗時に +1)
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  -- /api/feeds/health 用の個別タイムスタンプ
  last_success_at       TEXT,
  last_failure_at       TEXT
);

CREATE INDEX IF NOT EXISTS idx_feeds_category ON feeds(category);
CREATE INDEX IF NOT EXISTS idx_feeds_enabled ON feeds(enabled);

-- ---------------------------------------------------------------------------
-- articles: 収集した記事
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS articles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  guid         TEXT NOT NULL UNIQUE,
  feed_id      TEXT NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  url          TEXT NOT NULL,
  summary      TEXT,
  author       TEXT,
  published_at TEXT NOT NULL,
  fetched_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  category     TEXT NOT NULL,
  lang         TEXT NOT NULL DEFAULT 'en'
);

CREATE INDEX IF NOT EXISTS idx_articles_feed_id ON articles(feed_id);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_lang ON articles(lang);
CREATE INDEX IF NOT EXISTS idx_articles_fetched_at ON articles(fetched_at DESC);

-- listArticles の WHERE category = ? ORDER BY published_at DESC, id DESC を index only にするため
-- id を末尾に含めた複合インデックス (カーソルページングの tie-break もカバー)
CREATE INDEX IF NOT EXISTS idx_articles_category_published_at
  ON articles(category, published_at DESC, id DESC);

-- WHERE lang = ? ORDER BY published_at DESC, id DESC パターン向け
CREATE INDEX IF NOT EXISTS idx_articles_lang_published_at
  ON articles(lang, published_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- 全文検索 (FTS5, trigram tokenizer)
-- trigram は 3 文字 N-gram で分割するため、日本語・記号を含む任意の部分文字列を検索できる。
-- SQLite 3.43+ (Cloudflare D1 でサポート済み) が必要。
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title,
  summary,
  content='articles',
  content_rowid='id',
  tokenize='trigram'
);

CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, title, summary)
  VALUES (new.id, new.title, COALESCE(new.summary, ''));
END;

CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, summary)
  VALUES ('delete', old.id, old.title, COALESCE(old.summary, ''));
END;

CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
  INSERT INTO articles_fts(articles_fts, rowid, title, summary)
  VALUES ('delete', old.id, old.title, COALESCE(old.summary, ''));
  INSERT INTO articles_fts(rowid, title, summary)
  VALUES (new.id, new.title, COALESCE(new.summary, ''));
END;

-- ---------------------------------------------------------------------------
-- collector_runs: cron の 1 回分の実行を記録するテーブル
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS collector_runs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at        TEXT NOT NULL,
  completed_at      TEXT,
  feeds_total       INTEGER,
  feeds_ok          INTEGER,
  feeds_failed      INTEGER,
  articles_inserted INTEGER,
  error             TEXT
);

CREATE INDEX IF NOT EXISTS idx_collector_runs_started_desc ON collector_runs (started_at DESC);

-- collector_run_feeds: run ごとの各フィードの結果を記録するテーブル
CREATE TABLE IF NOT EXISTS collector_run_feeds (
  run_id            INTEGER NOT NULL REFERENCES collector_runs(id) ON DELETE CASCADE,
  feed_id           TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('ok', 'failed', 'skipped')),
  articles_inserted INTEGER NOT NULL DEFAULT 0,
  duration_ms       INTEGER NOT NULL DEFAULT 0,
  error             TEXT,
  PRIMARY KEY (run_id, feed_id)
);

-- ---------------------------------------------------------------------------
-- reports: GitHub Actions から定期投入する自動生成レポート
-- (kind, period_start, period_end, category, lang) を unique にして
-- リトライや再実行が idempotent な upsert になるようにする。
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  kind          TEXT NOT NULL CHECK (kind IN ('daily', 'weekly', 'monthly')),
  period_start  TEXT NOT NULL,
  period_end    TEXT NOT NULL,
  category      TEXT,
  lang          TEXT,
  content       TEXT NOT NULL,
  meta_json     TEXT,
  source_skill  TEXT NOT NULL,
  generated_at  TEXT NOT NULL
);

-- SQLite では NULL は UNIQUE 制約上 distinct 扱いになり、同 (kind, period, NULL category)
-- の重複が許容されてしまう。COALESCE 結果で UNIQUE にして "all" を明示扱いする。
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unique_period
  ON reports (
    kind,
    period_start,
    period_end,
    COALESCE(category, '__all__'),
    COALESCE(lang, '__all__')
  );

CREATE INDEX IF NOT EXISTS idx_reports_kind_generated
  ON reports (kind, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_reports_period
  ON reports (period_start, period_end);
