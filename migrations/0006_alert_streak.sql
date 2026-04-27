-- 連続失敗回数を追跡するカラム。成功時に 0 リセット、失敗時に +1 する。
ALTER TABLE feeds ADD COLUMN consecutive_failures INTEGER NOT NULL DEFAULT 0;
