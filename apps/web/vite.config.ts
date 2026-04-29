import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import yaml from "@modyfi/vite-plugin-yaml";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss(), react(), cloudflare(), yaml()],
  build: {
    outDir: "dist",
  },
});
