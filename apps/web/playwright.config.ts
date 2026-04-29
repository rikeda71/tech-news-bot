import { defineConfig, devices } from "@playwright/test";

// CI 環境では wrangler の状態ディレクトリを固定して seed が確実に読める場所を指定する
const persistTo = ".wrangler/state/e2e";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  webServer: {
    // pnpm dev = vp dev = @cloudflare/vite-plugin により Worker API + SPA が同一ポートで動く
    // migrate → seed → dev サーバー起動の順序を保証する
    command: [
      `npx wrangler d1 migrations apply tech-news-bot-db --local --persist-to ${persistTo}`,
      `npx wrangler d1 execute tech-news-bot-db --local --persist-to ${persistTo} --file=e2e/fixtures/seed.sql`,
      // pnpm dev = vp dev。CI では PATH に vp が無いため pnpm dev 経由を使う
      `WRANGLER_STATE=${persistTo} pnpm dev --port 5173`,
    ].join(" && "),
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // WRANGLER_STATE を渡して vite-plugin がこのディレクトリの D1 を参照するよう誘導する
    env: {
      WRANGLER_STATE: persistTo,
    },
  },
});
