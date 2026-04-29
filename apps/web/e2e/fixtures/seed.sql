-- e2e テスト用シードデータ (local D1 のみ)
-- wrangler d1 execute DB --local --file=apps/web/e2e/fixtures/seed.sql で投入する

-- 既存データをクリア
DELETE FROM articles;
DELETE FROM feeds;

-- feeds
INSERT INTO feeds (id, name, url, category, lang, enabled) VALUES
  ('google-blog', 'Google Blog', 'https://blog.google/rss/', 'bigtech', 'en', 1),
  ('openai-blog', 'OpenAI Blog', 'https://openai.com/news/rss.xml', 'ai', 'en', 1),
  ('cybozu-blog', 'Cybozu Tech Blog', 'https://blog.cybozu.io/feed', 'jp', 'ja', 1),
  ('zenn-trend', 'Zenn トレンド', 'https://zenn.dev/feed', 'zenn', 'ja', 1);

-- articles (21 件: load-more で 2 ページ以上必要なため)
INSERT INTO articles (guid, feed_id, title, url, summary, author, published_at, category, lang) VALUES
  ('g-001', 'google-blog', 'Google I/O 2025 Highlights', 'https://blog.google/io-2025', 'Google I/O 2025 の主なハイライトをまとめました。', 'Google Team', '2026-04-28T10:00:00Z', 'bigtech', 'en'),
  ('g-002', 'google-blog', 'Introducing Gemini 3', 'https://blog.google/gemini-3', 'Gemini 3 を本日発表しました。', 'Google Team', '2026-04-27T10:00:00Z', 'bigtech', 'en'),
  ('g-003', 'google-blog', 'Android 16 Release', 'https://blog.google/android-16', 'Android 16 の新機能について。', 'Android Team', '2026-04-26T10:00:00Z', 'bigtech', 'en'),
  ('g-004', 'google-blog', 'Chrome 130 Updates', 'https://blog.google/chrome-130', 'Chrome 130 のアップデート情報。', 'Chrome Team', '2026-04-25T10:00:00Z', 'bigtech', 'en'),
  ('g-005', 'google-blog', 'Google Cloud Next 2025', 'https://blog.google/cloud-next-2025', 'Google Cloud Next のまとめ。', 'Cloud Team', '2026-04-24T10:00:00Z', 'bigtech', 'en'),
  ('o-001', 'openai-blog', 'GPT-5 Announcement', 'https://openai.com/gpt5', 'GPT-5 を本日正式発表しました。', 'OpenAI', '2026-04-28T09:00:00Z', 'ai', 'en'),
  ('o-002', 'openai-blog', 'DALL-E 4 Preview', 'https://openai.com/dalle4', 'DALL-E 4 のプレビューを公開しました。', 'OpenAI', '2026-04-27T09:00:00Z', 'ai', 'en'),
  ('o-003', 'openai-blog', 'Sora Updates', 'https://openai.com/sora-updates', 'Sora の最新アップデートについて。', 'OpenAI', '2026-04-26T09:00:00Z', 'ai', 'en'),
  ('o-004', 'openai-blog', 'Safety Research 2025', 'https://openai.com/safety-2025', '2025 年の安全性研究のまとめ。', 'Safety Team', '2026-04-25T09:00:00Z', 'ai', 'en'),
  ('o-005', 'openai-blog', 'API Rate Limits Update', 'https://openai.com/api-update', 'API レート制限の更新について。', 'OpenAI', '2026-04-24T09:00:00Z', 'ai', 'en'),
  ('c-001', 'cybozu-blog', 'kintone の新機能', 'https://blog.cybozu.io/kintone-new', 'kintone の新機能を紹介します。', '田中太郎', '2026-04-28T08:00:00Z', 'jp', 'ja'),
  ('c-002', 'cybozu-blog', 'TypeScript 移行の取り組み', 'https://blog.cybozu.io/typescript', 'TypeScript への移行事例を紹介します。', '鈴木花子', '2026-04-27T08:00:00Z', 'jp', 'ja'),
  ('c-003', 'cybozu-blog', 'Kubernetes 運用 Tips', 'https://blog.cybozu.io/k8s-tips', 'Kubernetes 運用のコツを共有します。', '佐藤一郎', '2026-04-26T08:00:00Z', 'jp', 'ja'),
  ('c-004', 'cybozu-blog', 'React 19 対応', 'https://blog.cybozu.io/react19', 'React 19 への対応レポート。', '田中太郎', '2026-04-25T08:00:00Z', 'jp', 'ja'),
  ('c-005', 'cybozu-blog', 'テスト自動化の実践', 'https://blog.cybozu.io/test-automation', '自動テストの実践的な手法を紹介。', '鈴木花子', '2026-04-24T08:00:00Z', 'jp', 'ja'),
  ('z-001', 'zenn-trend', 'Zenn人気記事: Rustを始めよう', 'https://zenn.dev/example/rust', 'Rust 入門ガイド。', 'zenn_user1', '2026-04-28T07:00:00Z', 'zenn', 'ja'),
  ('z-002', 'zenn-trend', 'Zenn人気記事: TypeScript Tips', 'https://zenn.dev/example/ts-tips', 'TypeScript の便利な Tips 集。', 'zenn_user2', '2026-04-27T07:00:00Z', 'zenn', 'ja'),
  ('z-003', 'zenn-trend', 'Zenn人気記事: Docker最新情報', 'https://zenn.dev/example/docker', 'Docker の最新動向まとめ。', 'zenn_user3', '2026-04-26T07:00:00Z', 'zenn', 'ja'),
  ('z-004', 'zenn-trend', 'Zenn人気記事: Next.js 15', 'https://zenn.dev/example/nextjs15', 'Next.js 15 の新機能解説。', 'zenn_user4', '2026-04-25T07:00:00Z', 'zenn', 'ja'),
  ('z-005', 'zenn-trend', 'Zenn人気記事: Go言語入門', 'https://zenn.dev/example/go', 'Go 言語のエントリーポイント。', 'zenn_user5', '2026-04-24T07:00:00Z', 'zenn', 'ja'),
  ('z-006', 'zenn-trend', 'Zenn人気記事: Cloudflare Workers', 'https://zenn.dev/example/cf-workers', 'Cloudflare Workers 活用ガイド。', 'zenn_user6', '2026-04-23T07:00:00Z', 'zenn', 'ja');
