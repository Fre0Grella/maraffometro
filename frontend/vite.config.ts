/// <reference types="vitest/config" />
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const backend = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8787";

/**
 * Mirrors the Pages Functions proxy so development behaves like production:
 * /api/* and /auth/google go to the Worker. /auth/dev (the local demo sign-in)
 * exists only here; the deployed Worker answers it with a 404.
 */
const proxy = {
  "/api": { target: backend, changeOrigin: true },
  "/auth/google": { target: backend, changeOrigin: true },
  "/auth/dev": { target: backend, changeOrigin: true },
};

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Port 5173 everywhere: FRONTEND_URL and the Google redirect URI both name it.
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 5173, strictPort: true, proxy },
  test: { environment: "jsdom" },
});
