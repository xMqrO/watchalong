import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import watchalongApi from "./server/dev-plugin.js";

export default defineConfig({
  plugins: [react(), watchalongApi()],
  base: "./",
  build: {
    minify: "terser",
  },
  server: {
    port: 5173,
  },
});