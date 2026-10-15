import { computed, type MaybeRefOrGetter, toValue } from "vue";
import { useMutation, useQuery, useQueryClient } from "@tanstack/vue-query";
import type {
  ClaimCodeDTO,
  LeaderboardEntryDTO,
  MatchDetailDTO,
  MatchSummaryDTO,
  MeDTO,
  NotificationsDTO,
  PlayerDTO,
  PlayerStatsDTO,
  PlayerUpdateDTO,
} from "@maraffometro/shared";
import { api, ApiError } from "./client";
import { clearApiCache } from "@/composables/pwa";

export const keys = {
  me: ["me"] as const,
  players: ["players"] as const,
  leaderboard: ["leaderboard"] as const,
  matches: (player?: string) => ["matches", player ?? "all"] as const,
  match: (id: string) => ["match", id] as const,
  stats: (id: string) => ["stats", id] as const,
  notifications: ["notifications"] as const,
};

/** The signed-in player, or null when nobody is. */
export function useMe() {
  return useQuery({
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
  });
}

export function usePlayers() {
  return useQuery({ queryKey: keys.players, queryFn: () => api<PlayerDTO[]>("/players") });
}

export function useLeaderboard() {
  return useQuery({ queryKey: keys.leaderboard, queryFn: () => api<LeaderboardEntryDTO[]>("/leaderboard") });
}

export function useMatches(player?: MaybeRefOrGetter<string | undefined>, limit = 20) {
  return useQuery({
    queryKey: computed(() => keys.matches(toValue(player))),
    queryFn: () => {
      const p = toValue(player);
      return api<MatchSummaryDTO[]>(`/matches?limit=${limit}${p ? `&player=${p}` : ""}`);
    },
  });
}

export function useMatch(id: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => keys.match(toValue(id))),
    queryFn: () => api<MatchDetailDTO>(`/matches/${toValue(id)}`),
  });
}

export function usePlayerStats(id: MaybeRefOrGetter<string>) {
  return useQuery({
    queryKey: computed(() => keys.stats(toValue(id))),
    queryFn: () => api<PlayerStatsDTO>(`/players/${toValue(id)}/stats`),
  });
}

/** Whatever a recorded or voided match changes. */
export function invalidateResults(qc: ReturnType<typeof useQueryClient>) {
  for (const key of [["leaderboard"], ["matches"], ["match"], ["stats"]]) qc.invalidateQueries({ queryKey: key });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: PlayerUpdateDTO) => api<MeDTO>("/me", { method: "PUT", body: p }),
    onSuccess: (me) => {
      qc.setQueryData(keys.me, me);
      qc.invalidateQueries({ queryKey: keys.players });
      invalidateResults(qc);
    },
  });
}

export function useCreateGuest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api<PlayerDTO>("/players/guests", { method: "POST", body: { name } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.players }),
  });
}

export function useClaimCode() {
  return useMutation({
    mutationFn: (guestId: string) => api<ClaimCodeDTO>(`/players/${guestId}/claim-code`, { method: "POST" }),
  });
}

export function useClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api<{ claimed: PlayerDTO }>("/me/claim", { method: "POST", body: { code } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.players });
      invalidateResults(qc);
    },
  });
}

/**
 * The bell. A plain GET, polled every minute and whenever the app comes back
 * to the front; only for a signed-in player.
 */
export function useNotifications(enabled: MaybeRefOrGetter<boolean>) {
  return useQuery({
    queryKey: keys.notifications,
    queryFn: () => api<NotificationsDTO>("/notifications"),
    enabled: computed(() => toValue(enabled)),
    refetchInterval: 60_000,
    staleTime: 15_000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => api<{ ok: true }>("/notifications/read", { method: "POST", body: { ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications }),
  });
}

/** Opens a vote on deleting a match; the caller's vote counts as yes. */
export function useProposeDeletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (matchId: string) =>
      api<{ status: "open" | "approved" | "rejected" }>(`/matches/${matchId}/deletion`, { method: "POST" }),
    onSuccess: () => invalidateResults(qc),
  });
}

export function useVoteDeletion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ matchId, vote }: { matchId: string; vote: "yes" | "no" }) =>
      api<{ status: "open" | "approved" | "rejected" }>(`/matches/${matchId}/deletion/vote`, {
        method: "POST",
        body: { vote },
      }),
    onSuccess: () => {
      invalidateResults(qc);
      qc.invalidateQueries({ queryKey: keys.notifications });
    },
  });
}

/** Admins only: deletes a match without a vote. */
export function useVoidMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/matches/${id}/void`, { method: "POST" }),
    onSuccess: () => invalidateResults(qc),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>("/me", { method: "DELETE" }),
    onSuccess: () => {
      clearApiCache();
      qc.setQueryData(keys.me, null);
      qc.invalidateQueries({ queryKey: keys.players });
      invalidateResults(qc);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>("/session", { method: "DELETE" }),
    onSuccess: () => {
      clearApiCache();
      qc.setQueryData(keys.me, null);
    },
  });
}
