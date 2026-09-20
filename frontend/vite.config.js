import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages "project sites" (https://USERNAME.github.io/REPO_NAME/) serve
// the app from a subpath, so Vite needs to know that subpath at build time.
// The deploy workflow sets VITE_BASE_PATH for you (see README). For local
// dev this defaults to '/', which is what you want.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || "/",
});
