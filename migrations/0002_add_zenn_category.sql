-- feeds.category の CHECK 制約に 'zenn' を追加する。
-- SQLite は CHECK 制約を直接変更できないため、table を再作成する。
-- articles.category は CHECK 制約が無いので変更不要。

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
