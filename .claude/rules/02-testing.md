# テスト規約

- テストランナー: vitest 4 + `@cloudflare/vitest-pool-workers` v0.15。
- テストファイル配置: `apps/web/tests/<area>/<file>.test.ts` (worker/collector/db/api などのエリア別)。
- 各テストは `apps/web/tests/setup.ts` で D1 がリセット + マイグレーション再適用される前提。`beforeEach` で `DELETE FROM` 等は不要。
- `cloudflare:test` から `env`, `SELF`, `applyD1Migrations` を import。
- テスト実行前に必ず `pnpm build` (vitest-pool-workers が `apps/web/dist/client` を要求するため)。
- 統合テストは `SELF.fetch("https://example.com/...")` 経由で Worker をエンドツーエンドで呼ぶ。
- 新機能・バグ修正は基本的にテストを追加してから PR を出す。
