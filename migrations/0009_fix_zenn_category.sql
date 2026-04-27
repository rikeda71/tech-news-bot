-- 過去に zenn フィードが category=jp で登録されていた頃の articles を zenn に修正
UPDATE articles
SET category = 'zenn'
WHERE feed_id LIKE 'zenn-%' AND category != 'zenn';
