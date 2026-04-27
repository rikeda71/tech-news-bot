-- conditional GET に使う ETag / Last-Modified を保持するカラムを追加する。
-- 既存レコードは NULL (次回 200 応答時に埋まる)。
ALTER TABLE feeds ADD COLUMN last_etag TEXT;
ALTER TABLE feeds ADD COLUMN last_modified TEXT;
