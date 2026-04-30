-- zenn カテゴリを廃止し personal カテゴリに置き換える。
-- 既存の category='zenn' のデータ (articles, feeds) はすべて削除する。
--
-- articles が feeds を REFERENCES しているため、
-- articles → FTS → feeds の順で削除・再作成する (0002 と同じ手順)。

-- Step 1: 復元対象 (zenn 以外) の articles を退避
CREATE TABLE articles_backup AS
SELECT * FROM articles WHERE category != 'zenn';

-- Step 2: zenn フィードに紐づく reports は category 値が NULL ではないので
-- 明示的に削除しておく (reports は feeds への FK を持たない)
DELETE FROM reports WHERE category = 'zenn';

-- Step 3: FTS テーブルと articles を削除
DROP TABLE IF EXISTS articles_fts;
DROP TABLE IF EXISTS articles;

-- Step 4: zenn の feeds を削除し、新しい CHECK 制約で feeds を再作成
DELETE FROM feeds WHERE category = 'zenn';

-- 注意: 0005-0007 で ALTER TABLE で追加されたカラムは末尾に並ぶ。
-- feeds_new はその実カラム順序に合わせて定義する (SELECT * の挙動を一致させるため)。
CREATE TABLE feeds_new (
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
  last_etag             TEXT,
  last_modified         TEXT,
  consecutive_failures  INTEGER NOT NULL DEFAULT 0,
  last_success_at       TEXT,
  last_failure_at       TEXT
);

-- カラムを明示してミスマッチを防ぐ
INSERT INTO feeds_new (
  id, name, url, category, lang, enabled,
  last_fetched_at, last_status, last_error,
  created_at, updated_at,
  last_etag, last_modified,
  consecutive_failures, last_success_at, last_failure_at
)
SELECT
  id, name, url, category, lang, enabled,
  last_fetched_at, last_status, last_error,
  created_at, updated_at,
  last_etag, last_modified,
  consecutive_failures, last_success_at, last_failure_at
FROM feeds;

DROP TABLE feeds;
ALTER TABLE feeds_new RENAME TO feeds;

CREATE INDEX IF NOT EXISTS idx_feeds_category ON feeds(category);
CREATE INDEX IF NOT EXISTS idx_feeds_enabled ON feeds(enabled);

-- Step 5: articles を再作成
CREATE TABLE articles (
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

-- 0004 で追加した複合インデックスも再作成 (category / lang × published_at × id)
CREATE INDEX IF NOT EXISTS idx_articles_category_published_at
  ON articles(category, published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_articles_lang_published_at
  ON articles(lang, published_at DESC, id DESC);

-- Step 6: バックアップから zenn 以外の記事を復元
INSERT INTO articles SELECT * FROM articles_backup;

-- Step 7: バックアップを削除
DROP TABLE articles_backup;

-- Step 8: FTS テーブルとトリガーを再作成 (0003 の trigram tokenizer 構成)
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title,
  summary,
  content='articles',
  content_rowid='id',
  tokenize='trigram'
);

INSERT INTO articles_fts(articles_fts) VALUES ('rebuild');

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
