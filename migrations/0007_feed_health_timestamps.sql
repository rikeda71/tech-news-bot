-- /api/feeds/health エンドポイントで last_success_at / last_failure_at を個別に返すため追加。
-- recordFetchSuccess が last_success_at を、recordFetchError が last_failure_at を更新する。
ALTER TABLE feeds ADD COLUMN last_success_at TEXT;
ALTER TABLE feeds ADD COLUMN last_failure_at TEXT;
