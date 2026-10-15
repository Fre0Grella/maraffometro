import { defineStore } from "pinia";
import { ref, watch } from "vue";
import type { MatchSubmitDTO } from "@maraffometro/shared";
import { api, ApiError } from "@/api/client";

const STORAGE_KEY = "maraffometro.outbox";

export interface Pending {
  match: MatchSubmitDTO;
  /** Set when the server refused the match outright, so retrying won't help. */
  error: string | null;
}

function load(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as Pending[];
  } catch {
    return [];
  }
}

/**
 * Finished matches waiting to reach the server. Canteen wifi comes and goes;
 * a match is only removed from here once the server has it. Resubmitting is
 * safe because the server recognises the match id.
 */
export const useOutbox = defineStore("outbox", () => {
  const pending = ref<Pending[]>(load());
  const flushing = ref(false);

  watch(
    pending,
    (p) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
      } catch {
        // Nothing to do: the list still lives for this session.
      }
    },
    { deep: true },
  );

  function enqueue(match: MatchSubmitDTO) {
    if (!pending.value.some((p) => p.match.id === match.id)) pending.value.push({ match, error: null });
  }

  /** Sends what it can. Returns how many matches reached the server. */
  async function flush(): Promise<number> {
    if (flushing.value) return 0;
    flushing.value = true;
    let sent = 0;
    try {
      for (const item of [...pending.value]) {
        if (item.error) continue;
        try {
          await api("/matches", { method: "POST", body: item.match });
          pending.value = pending.value.filter((p) => p.match.id !== item.match.id);
          sent++;
        } catch (e) {
          if (!(e instanceof ApiError)) throw e;
          // Offline, signed out, or the server hiccuped: keep it and try later.
          if (e.status === 0 || e.status === 401 || e.status >= 500) break;
          item.error = e.message;
        }
      }
    } finally {
      flushing.value = false;
    }
    return sent;
  }

  function drop(id: string) {
    pending.value = pending.value.filter((p) => p.match.id !== id);
  }

  return { pending, flushing, enqueue, flush, drop };
});
