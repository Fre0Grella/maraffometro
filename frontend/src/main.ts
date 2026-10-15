import { createApp } from "vue";
import { createPinia } from "pinia";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import App from "./App.vue";
import { createAppRouter } from "./router";
import { initPwa } from "./composables/pwa";
// Bundled rather than loaded from Google Fonts, so no visitor's IP goes to a third party.
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/figtree/wght.css";
import "./styles.css";

initPwa();

const queryClient = new QueryClient({
  defaultOptions: {
    // Always try the request: offline, the service worker answers from its
    // cache. TanStack's default would pause and never ask it.
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true, networkMode: "offlineFirst" },
    // Fail fast offline (the error says so) instead of hanging paused.
    mutations: { networkMode: "always" },
  },
});

const router = createAppRouter(queryClient);
createApp(App).use(createPinia()).use(VueQueryPlugin, { queryClient }).use(router).mount("#app");

/**
 * Fades out the launch screen (index.html) once the first page is on screen,
 * and not before the cards have been dealt, in the installed app and in the
 * browser alike.
 */
async function hideSplash() {
  const splash = document.getElementById("splash");
  if (!splash) return;
  await router.isReady().catch(() => {});
  const minimum = 1300;
  setTimeout(() => {
    splash.classList.add("out");
    setTimeout(() => splash.remove(), 400);
  }, Math.max(0, minimum - performance.now()));
}
hideSplash();
