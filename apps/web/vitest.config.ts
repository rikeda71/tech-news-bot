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
