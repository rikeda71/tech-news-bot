-- reports: GitHub Actions から定期投入する自動生成レポートを保存する。
-- (kind, period_start, period_end, category, lang) を unique にして
-- リトライや再実行が idempotent な upsert になるようにする。
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
