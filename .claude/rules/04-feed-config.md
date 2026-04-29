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
  3. `category` は `bigtech | ai | jp | zenn` のみ。新カテゴリを増やす場合は型 (`apps/web/worker/types.ts`) と oxlint の category 制約も更新
  4. `lang` は `ja | en` のみ
  5. `enabled: false` は一時停止用 (削除より優先)
- EOL / 重複と分かったフィードは削除する (例: yahoo-japan-techblog は LINEヤフー Tech Blog と redirect 先が同一なため削除済み)
- Zenn のフィード URL パターン:
  - 全体トレンド: `https://zenn.dev/feed`
  - トピック: `https://zenn.dev/topics/<slug>/feed`
  - ユーザー: `https://zenn.dev/<user>/feed` (`?all=1` で全件)
- **Zenn は独立カテゴリ** (`category: zenn`): Zenn 由来の全フィード (`zenn-*`) は `bigtech` / `ai` / `jp` に分散させず、必ず `zenn` を使う。複数トピックで同一記事が出やすいため、Skill 側で URL による de-dup が必要 (SKILL.md Stage 1 参照)。
- YAML は `@modyfi/vite-plugin-yaml` により build 時に JSON へ変換され Worker bundle に inline される。runtime 依存は無し。
