import path from "node:path";
import { readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import { defineWorkersProject } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersProject(async () => {
  const migrations = await readD1Migrations(path.resolve(__dirname, "migrations"));
  return {
    test: {
      setupFiles: [],
      poolOptions: {
        workers: {
          singleWorker: true,
          isolatedStorage: true,
          miniflare: {
            d1Databases: ["DB"],
            compatibilityFlags: ["nodejs_compat"],
            bindings: {
              TEST_MIGRATIONS: migrations,
            },
          },
          wrangler: { configPath: "./wrangler.toml" },
        },
      },
    },
  };
});
