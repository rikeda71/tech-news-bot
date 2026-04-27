import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import yaml from "@modyfi/vite-plugin-yaml";

export default defineConfig({
  plugins: [react(), cloudflare(), yaml()],
  build: {
    outDir: "dist",
  },
});
