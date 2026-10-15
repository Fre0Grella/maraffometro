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

createApp(App).use(createPinia()).use(VueQueryPlugin, { queryClient }).use(createAppRouter(queryClient)).mount("#app");
