-- feeds.category の CHECK 制約に 'zenn' を追加する。
-- articles が feeds を REFERENCES しているため、
-- articles → FTS → feeds の順で削除・再作成する。
--
-- 本番では SQLITE_LOCKED を回避するため手動でステップ実行済み (2026-04-28)。
-- このファイルは d1_migrations に記録済みなので wrangler が再実行することはない。

-- Step 1: articles データを退避
CREATE TABLE articles_backup AS SELECT * FROM articles;

-- Step 2: FTS テーブルと articles を削除
DROP TABLE articles_fts;
DROP TABLE articles;

-- Step 3: feeds を新しい CHECK 制約で再作成
CREATE TABLE feeds_new (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  url             TEXT NOT NULL,
  category        TEXT NOT NULL CHECK (category IN ('bigtech', 'ai', 'jp', 'zenn')),
  lang            TEXT NOT NULL DEFAULT 'en' CHECK (lang IN ('ja', 'en')),
  enabled         INTEGER NOT NULL DEFAULT 1,
  last_fetched_at TEXT,
  last_status     TEXT,
  last_error      TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO feeds_new SELECT * FROM feeds;

DROP TABLE feeds;
ALTER TABLE feeds_new RENAME TO feeds;

CREATE INDEX IF NOT EXISTS idx_feeds_category ON feeds(category);
CREATE INDEX IF NOT EXISTS idx_feeds_enabled ON feeds(enabled);

-- Step 4: articles を再作成
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

-- Step 5: バックアップからデータを復元
INSERT INTO articles SELECT * FROM articles_backup;

-- Step 6: バックアップを削除
DROP TABLE articles_backup;

-- Step 7: FTS テーブルとトリガーを再作成
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title,
  summary,
  content='articles',
  content_rowid='id',
  tokenize='unicode61'
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
