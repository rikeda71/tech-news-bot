# テスト規約

- テストランナー: Vite+ 同梱の vitest 4 (`vite-plus/test`) + `@cloudflare/vitest-pool-workers` v0.15。
- 起動コマンド: `apps/web/` で `vp test run` (CI もここで動かす)。root から走らせる場合は `pnpm test` (= `pnpm --filter @tnb/web run test`)。
- テストファイル配置: `apps/web/tests/<area>/<file>.test.ts` (worker/collector/db/api などのエリア別)。
- 各テストは `apps/web/tests/setup.ts` で D1 がリセット + マイグレーション再適用される前提。`beforeEach` で `DELETE FROM` 等は不要。
- import:
  - `vitest` の API は `vite-plus/test` から import (`describe`, `it`, `expect`, `beforeEach`...)。生 `vitest` を import しない。
  - `cloudflare:test` から `env`, `SELF`, `applyD1Migrations`, `reset` を import。
- テスト実行前に必ず `vp run build` / `pnpm build` (vitest-pool-workers が `apps/web/dist/client` を要求するため)。
- 統合テストは `SELF.fetch("https://example.com/...")` 経由で Worker をエンドツーエンドで呼ぶ。
- 新機能・バグ修正は基本的にテストを追加してから PR を出す。
