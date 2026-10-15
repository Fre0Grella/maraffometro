import { createRouter, createWebHistory } from "vue-router";
import type { QueryClient } from "@tanstack/vue-query";
import type { MeDTO } from "@maraffometro/shared";
import { api, ApiError } from "@/api/client";
import { keys } from "@/api/queries";

export function createAppRouter(queryClient: QueryClient) {
  const router = createRouter({
    history: createWebHistory(),
    scrollBehavior: () => ({ top: 0 }),
    routes: [
      { path: "/", name: "home", component: () => import("@/views/HomeView.vue") },
      { path: "/accedi", name: "login", component: () => import("@/views/LoginView.vue") },
      { path: "/partite", name: "matches", component: () => import("@/views/MatchesView.vue") },
      { path: "/partite/:id", name: "match", component: () => import("@/views/MatchView.vue"), props: true },
      { path: "/giocatori/:id", name: "player", component: () => import("@/views/PlayerView.vue"), props: true },
      { path: "/nuova", name: "new", component: () => import("@/views/NewMatchView.vue"), meta: { auth: true } },
      { path: "/al-tavolo", name: "live", component: () => import("@/views/LiveMatchView.vue"), meta: { auth: true } },
      { path: "/profilo", name: "profile", component: () => import("@/views/ProfileView.vue"), meta: { auth: true } },
      { path: "/:rest(.*)*", redirect: "/" },
    ],
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
    return me ? true : { name: "login", query: { poi: to.fullPath } };
  });

  return router;
}
