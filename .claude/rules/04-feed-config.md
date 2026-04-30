---
paths:
  - "apps/web/worker/feeds.yaml"
  - "apps/web/worker/feed-config.ts"
  - "apps/web/worker/types.ts"
---

# Feed 設定 (feeds.yaml) のルール

- 場所: `apps/web/worker/feeds.yaml`
- 追加・変更時は次を順守:
  1. `id` は全フィード横断でユニーク、kebab-case
  2. `url` は HEAD/GET で 200 を返し、Content-Type が `application/(rss|atom)+xml`, `text/xml`, `application/xml` のいずれかであることを確認
  3. `category` は `bigtech | ai | jp | personal` のみ。新カテゴリを増やす場合は型 (`apps/web/worker/types.ts`) と oxlint の category 制約も更新
  4. `lang` は `ja | en` のみ
  5. `enabled: false` は一時停止用 (削除より優先)
- EOL / 重複と分かったフィードは削除する (例: yahoo-japan-techblog は LINEヤフー Tech Blog と redirect 先が同一なため削除済み)
- Zenn のフィード URL パターン:
  - publication (企業): `https://zenn.dev/p/<slug>/feed` → 企業の所属国 / 性質に応じて `jp` 等のカテゴリへ
  - ユーザー (個人): `https://zenn.dev/<user>/feed` (`?all=1` で全件) → `personal` カテゴリ
- **`personal` カテゴリは個人ブログ専用**: Zenn の個人ユーザー feed や著名な個人ブログを集約する。レポート/ダイジェスト系 skill (`tech-news-digest` / `tech-news-weekly`) と `top_authors_30d` ランキングからは除外される (`bigtech` / `ai` / `jp` の 3 カテゴリのみがレポート対象)。複数フィードで同一記事が出やすい場合は Skill 側で URL による de-dup を行う (SKILL.md Stage 1 参照)。
- YAML は `@modyfi/vite-plugin-yaml` により build 時に JSON へ変換され Worker bundle に inline される。runtime 依存は無し。
