import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vite-plus";
import yaml from "@modyfi/vite-plugin-yaml";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.resolve(__dirname, "../../migrations"));
  return {
    plugins: [
      yaml(),
      cloudflareTest({
        wrangler: { configPath: "./wrangler.toml" },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            // テスト用トークン (本番では wrangler secret put で登録)
            ADMIN_TOKEN: "test-admin-token",
            ADMIN_TOKEN_NEXT: "test-admin-token-next",
            // フィード収集テストで外部 fetch が失敗するため短くしてタイムアウトを速める
            COLLECTOR_TIMEOUT_MS: "500",
            // 本番は 1 並列だが、テストでは全 yaml feed を直列に回すと per-feed retry で
            // 25-30s deadline を超えるため 4 並列に上書きする (Medium レート制限テストではない)
            COLLECTOR_CONCURRENCY: "4",
            // 全 enabled feed (45 件超) × per-feed retry x backoff sleep が 25s deadline に
            // 張り付き /api/admin/collector/run が CI で 504 flaky になっていたため、
            // retry を無効化する。リトライ自体の挙動は collector/retry.test.ts が個別に検証する。
            COLLECTOR_RETRIES: "0",
          },
        },
      }),
    ],
    test: {
      setupFiles: ["./tests/setup.ts"],
      // tests/client/ は vitest.client.config.ts で別プールとして実行するため除外
      include: ["tests/worker/**/*.test.ts"],
    },
  };
});
