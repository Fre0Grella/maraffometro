/// <reference types="vitest/config" />
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

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
  plugins: [
    vue(),
    /**
     * Installable and usable without signal: the service worker precaches the
     * whole app (every route chunk, the fonts), so a match can be scored in a
     * basement canteen. API reads go network-first and fall back to the last
     * answer, which is what lets the player picker and the session work
     * offline. Finished matches wait in the outbox (stores/outbox.ts).
     */
    VitePWA({
      // Ask before swapping versions: a silent reload mid-match would be rude.
      registerType: "prompt",
      injectRegister: false,
      // The precache glob below already takes every icon; listing them again
      // here duplicates entries, and a duplicate fails the whole install.
      includeManifestIcons: false,
      manifest: {
        name: "Maraffometro",
        short_name: "Maraffometro",
        description: "Classifica, statistiche e segnapunti per la Maraffa della pausa pranzo.",
        lang: "it",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#f4ecdd",
        // The tab bar's colour in dark mode (--card), so the installed app's
        // system bars match it. The status bar follows the page's own
        // theme-color meta (cream in light mode).
        theme_color: "#2a221c",
        icons: [
          { src: "/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        // The API and the Google sign-in must always reach the network.
        navigateFallbackDenylist: [/^\/api\//, /^\/auth\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url, request }) => request.method === "GET" && url.pathname.startsWith("/api/v1/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "api",
              // Canteen wifi that connects but never answers counts as offline.
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Port 5173 everywhere: FRONTEND_URL and the Google redirect URI both name it.
  server: { port: 5173, strictPort: true, proxy },
  preview: { port: 5173, strictPort: true, proxy },
  test: { environment: "jsdom" },
});
