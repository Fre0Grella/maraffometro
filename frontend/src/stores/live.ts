import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import {
  handFromManoPoints,
  nextManoSeat,
  scoreMatch,
  scoreSet,
  type MatchSubmitDTO,
  type PlayerDTO,
  type Seat,
  type SetRecord,
  type SetTarget,
} from "@maraffometro/shared";

const STORAGE_KEY = "maraffometro.live";

interface LiveState {
  id: string;
  playedAt: string;
  /** Indexed by seat, in playing order; 0 and 2 are team A. */
  seats: [PlayerDTO, PlayerDTO, PlayerDTO, PlayerDTO];
  sets: SetRecord[];
  /** Who leads the next hand. */
  manoSeat: Seat;
  /**
   * The first set, or a tie-break, has been dealt and nobody has said who
   * holds the four of denari yet: that player leads, so it has to be asked.
   */
  awaitingFirstMano: boolean;
}

function load(): LiveState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LiveState) : null;
  } catch {
    return null;
  }
}

/**
 * The match being scored at the table. Kept on the phone, so a reload, a
 * locked screen or a dead tab mid-match loses nothing; it only reaches the
 * server, through the outbox, once the match is over.
 */
export const useLiveMatch = defineStore("live", () => {
  const state = ref<LiveState | null>(load());

  watch(
    state,
    (s) => {
      try {
        if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
        else localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Private mode or full storage: the match still works, it just won't survive a reload.
      }
    },
    { deep: true },
  );

  const active = computed(() => state.value !== null);
  const currentSet = computed(() => state.value?.sets.at(-1) ?? null);
  const currentResult = computed(() => (currentSet.value ? scoreSet(currentSet.value) : null));
  const matchResult = computed(() => (state.value ? scoreMatch(state.value) : null));
  /** The current set has a winner: time to pick the next set or end the match. */
  const setOver = computed(() => currentResult.value?.winner != null);
  const handCount = computed(() => state.value?.sets.reduce((n, s) => n + s.hands.length, 0) ?? 0);

  function start(seats: LiveState["seats"], target: SetTarget) {
    state.value = {
      id: crypto.randomUUID(),
      playedAt: new Date().toISOString(),
      seats,
      sets: [{ target, hands: [] }],
      manoSeat: 0,
      awaitingFirstMano: true,
    };
  }

  function addHand(manoPoints: number, maraffa = false) {
    const s = state.value;
    if (!s || setOver.value || s.awaitingFirstMano) return;
    s.sets.at(-1)!.hands.push(handFromManoPoints(s.manoSeat, manoPoints, maraffa));
    s.manoSeat = nextManoSeat(s.manoSeat);
  }

  /** Who holds the four of denari at the start of a set, or a correction after a slip. */
  function setMano(seat: Seat) {
    if (!state.value) return;
    state.value.manoSeat = seat;
    state.value.awaitingFirstMano = false;
  }

  /**
   * A following set usually just carries on the rotation; a tie-break (sets
   * level) usually starts again from whoever holds the four of denari. Those
   * are the defaults; either can be changed at the table.
   */
  function nextSet(target: SetTarget) {
    if (!state.value || !setOver.value) return;
    const [a, b] = matchResult.value!.setsWon;
    state.value.sets.push({ target, hands: [] });
    state.value.awaitingFirstMano = a === b;
  }

  /** Steps back one hand, or out of a set that was opened but not played yet. */
  function undo() {
    const s = state.value;
    if (!s) return;
    const set = s.sets.at(-1)!;
    if (set.hands.length === 0) {
      if (s.sets.length > 1) {
        s.sets.pop();
        s.awaitingFirstMano = false;
      } else {
        s.awaitingFirstMano = true;
      }
      return;
    }
    const hand = set.hands.pop()!;
    // The undone hand's leader leads it again, even if it was the set's first.
    s.manoSeat = hand.manoSeat;
    s.awaitingFirstMano = false;
  }

  /** What gets submitted. Null if nothing was played. */
  function toSubmission(): MatchSubmitDTO | null {
    const s = state.value;
    if (!s || handCount.value === 0) return null;
    return {
      id: s.id,
      playedAt: s.playedAt,
      seats: s.seats.map((p) => p.id) as MatchSubmitDTO["seats"],
      sets: s.sets.filter((set) => set.hands.length > 0).map((set) => ({ target: set.target, hands: set.hands })),
    };
  }

  function discard() {
    state.value = null;
  }

  return {
    state,
    active,
    currentSet,
    currentResult,
    matchResult,
    setOver,
    handCount,
    start,
    addHand,
    setMano,
    nextSet,
    undo,
    toSubmission,
    discard,
  };
});
