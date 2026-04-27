-- category + published_at + id の複合インデックス
-- listArticles の WHERE category = ? ORDER BY published_at DESC, id DESC クエリで
-- SQLite が単一インデックスしか使えない問題を解消する。
-- id を末尾に含めることでカーソルページングの tie-break も index only scan で賄える。
CREATE INDEX IF NOT EXISTS idx_articles_category_published_at
  ON articles(category, published_at DESC, id DESC);

-- lang + published_at + id の複合インデックス
-- WHERE lang = ? ORDER BY published_at DESC, id DESC パターン向け。
CREATE INDEX IF NOT EXISTS idx_articles_lang_published_at
  ON articles(lang, published_at DESC, id DESC);
