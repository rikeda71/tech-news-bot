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
