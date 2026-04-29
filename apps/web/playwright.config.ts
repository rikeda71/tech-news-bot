import { defineConfig, devices } from "@playwright/test";

// @cloudflare/vite-plugin は `<root>/v3/d1/...` の構造で D1 を persist する。
// `wrangler --persist-to .wrangler/state` に揃えると vite-plugin と同じ場所に migration / seed が当たる。
const persistTo = ".wrangler/state";

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
      `pnpm dev --port 5173`,
    ].join(" && "),
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
