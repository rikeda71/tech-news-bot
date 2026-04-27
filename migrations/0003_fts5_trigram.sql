-- FTS5 tokenizer を unicode61 から trigram に変更する。
-- trigram は 3 文字 N-gram で分割するため、日本語・記号を含む任意の部分文字列を検索できる。
-- SQLite 3.43+ (Cloudflare D1 でサポート済み) が必要。

-- Step 1: 既存の FTS トリガを削除
DROP TRIGGER IF EXISTS articles_ai;
DROP TRIGGER IF EXISTS articles_ad;
DROP TRIGGER IF EXISTS articles_au;

-- Step 2: 既存の FTS テーブルを削除
DROP TABLE IF EXISTS articles_fts;

-- Step 3: trigram tokenizer で FTS テーブルを再作成
CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
  title,
  summary,
  content='articles',
  content_rowid='id',
  tokenize='trigram'
);

-- Step 4: 既存記事を trigram で再 index
INSERT INTO articles_fts(articles_fts) VALUES ('rebuild');

-- Step 5: トリガを再作成
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
