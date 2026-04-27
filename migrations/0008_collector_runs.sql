-- collector_runs: cron の 1 回分の実行を記録するテーブル
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
