import { createRouter, createWebHistory } from "vue-router";
import type { QueryClient } from "@tanstack/vue-query";
import type { MeDTO } from "@maraffometro/shared";
import { api, ApiError } from "@/api/client";
import { keys } from "@/api/queries";

const RELOAD_KEY = "maraffometro.chunk-reload";

function isStaleChunkError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|Unable to preload|Failed to fetch|error loading/i.test(message);
}

/** Full reload to `path`, at most once a minute so a real outage can't loop. */
function reloadInto(path: string): void {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // No storage: reload anyway; the worst case is one extra reload.
  }
  window.location.assign(path);
}

export function createAppRouter(queryClient: QueryClient) {
  const router = createRouter({
    history: createWebHistory(),
    scrollBehavior: () => ({ top: 0 }),
    routes: [
      { path: "/", name: "home", component: () => import("@/views/HomeView.vue") },
      { path: "/login", name: "login", component: () => import("@/views/LoginView.vue") },
      { path: "/matches", name: "matches", component: () => import("@/views/MatchesView.vue") },
      { path: "/matches/:id", name: "match", component: () => import("@/views/MatchView.vue"), props: true },
      { path: "/players/:id", name: "player", component: () => import("@/views/PlayerView.vue"), props: true },
      { path: "/new", name: "new", component: () => import("@/views/NewMatchView.vue"), meta: { auth: true } },
      { path: "/table", name: "live", component: () => import("@/views/LiveMatchView.vue"), meta: { auth: true } },
      { path: "/profile", name: "profile", component: () => import("@/views/ProfileView.vue"), meta: { auth: true } },
      { path: "/privacy", name: "privacy", component: () => import("@/views/PrivacyView.vue") },
      { path: "/terms", name: "terms", component: () => import("@/views/TermsView.vue") },
      // The address first given to Google's consent screen.
      { path: "/termini", redirect: "/terms" },
      { path: "/:rest(.*)*", redirect: "/" },
    ],
  });

  // After a deploy, an app opened earlier still asks for the old page chunks,
  // which no longer exist: the tap does nothing. Reload once into where the
  // player was going, which fetches the new app.
  router.onError((error, to) => {
    if (isStaleChunkError(error)) reloadInto(to.fullPath);
  });

  router.beforeEach(async (to) => {
    if (!to.meta.auth) return true;
    const me = await queryClient.fetchQuery({
      queryKey: keys.me,
      queryFn: async () => {
        try {
          return await api<MeDTO>("/me");
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) return null;
          throw e;
        }
      },
      staleTime: 5 * 60_000,
    }).catch(() => undefined);
    // Offline with no answer: let the live tracker open anyway, it needs no server.
    if (me === undefined) return true;
    return me ? true : { name: "login" };
  });

  return router;
}
