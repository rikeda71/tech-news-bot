import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    include: ["tests/client/**/*.test.{ts,tsx}"],
    setupFiles: ["./tests/client/setup.ts"],
    globals: false,
  },
});
