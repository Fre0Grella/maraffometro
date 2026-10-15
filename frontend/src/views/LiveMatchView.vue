<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import {
  HAND_POINTS,
  MARAFFA_BONUS,
  SET_TARGETS,
  handScore,
  seatsOfTeam,
  teamOfSeat,
  type Seat,
  type SetTarget,
  type Team,
} from "@maraffometro/shared";
import { invalidateResults } from "@/api/queries";
import { useLiveMatch } from "@/stores/live";
import { useOutbox } from "@/stores/outbox";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import BottomSheet from "@/components/BottomSheet.vue";

const router = useRouter();
const live = useLiveMatch();
const outbox = useOutbox();
const qc = useQueryClient();

const s = computed(() => live.state!);
const manoSeat = computed(() => s.value.manoSeat);
const manoTeam = computed(() => teamOfSeat(manoSeat.value));
const score = computed<[number, number]>(() => live.currentResult?.score ?? [0, 0]);
const target = computed(() => live.currentSet?.target ?? 41);
const setNumber = computed(() => s.value.sets.length);
const setsWon = computed<[number, number]>(() => live.matchResult?.setsWon ?? [0, 0]);

const teamName = (t: Team) => seatsOfTeam(t).map((seat) => s.value.seats[seat].name).join(" & ");

// ── Entering a hand ──────────────────────────────────────────────────────
const points = ref<number | null>(null);
const maraffa = ref(false);
const maraffaSeat = ref<Seat>(0);

watch(manoSeat, () => {
  // The maraffa belongs, nearly always, to whoever called trumps.
  maraffaSeat.value = manoSeat.value;
}, { immediate: true });

const preview = computed<[number, number] | null>(() => {
  if (points.value === null) return null;
  const pts: [number, number] = [0, 0];
  pts[manoTeam.value] = points.value;
  pts[1 - manoTeam.value] = HAND_POINTS - points.value;
  if (maraffa.value) pts[teamOfSeat(maraffaSeat.value)] += MARAFFA_BONUS;
  return pts;
});

function record() {
  if (points.value === null) return;
  live.addHand(points.value, maraffa.value ? maraffaSeat.value : null);
  points.value = null;
  maraffa.value = false;
  navigator.vibrate?.(12);
}

function undo() {
  live.undo();
  points.value = null;
  maraffa.value = false;
}

// ── Who is di mano ──────────────────────────────────────────────────────
const choosingMano = ref(false);
function chooseMano(seat: Seat) {
  live.setMano(seat);
  choosingMano.value = false;
}

// ── End of a set, end of the match ───────────────────────────────────────
const setWinner = computed(() => live.currentResult?.winner ?? null);
const finishing = ref(false);
const menu = ref(false);
const confirmDiscard = ref(false);
const sending = ref(false);

function nextSet(t: SetTarget) {
  live.nextSet(t);
}

async function save() {
  const submission = live.toSubmission();
  if (!submission) {
    live.discard();
    router.replace("/");
    return;
  }
  sending.value = true;
  outbox.enqueue(submission);
  live.discard();
  const sent = await outbox.flush().catch(() => 0);
  sending.value = false;
  if (sent > 0) {
    invalidateResults(qc);
    router.replace(`/partite/${submission.id}`);
  } else {
    router.replace("/");
  }
}

function discard() {
  live.discard();
  router.replace("/");
}

const history = computed(() =>
  (live.currentSet?.hands ?? [])
    .map((h, i) => ({ h, i, add: handScore(h) }))
    .reverse(),
);

const result = computed(() => live.matchResult);

// ── Keep the screen on while scoring ─────────────────────────────────────
let wakeLock: { release(): Promise<void> } | null = null;
async function holdScreen() {
  try {
    wakeLock = await (navigator as unknown as { wakeLock?: { request(t: "screen"): Promise<{ release(): Promise<void> }> } })
      .wakeLock?.request("screen") ?? null;
  } catch {
    wakeLock = null;
  }
}
function onVisible() {
  if (document.visibilityState === "visible") holdScreen();
}
onMounted(() => {
  if (!live.active) router.replace("/nuova");
  holdScreen();
  document.addEventListener("visibilitychange", onVisible);
});
onBeforeUnmount(() => {
  wakeLock?.release().catch(() => {});
  document.removeEventListener("visibilitychange", onVisible);
});
</script>

<template>
  <main v-if="live.state" class="live">
    <header class="bar">
      <button class="icon" aria-label="Menu partita" @click="menu = true">☰</button>
      <div class="setinfo">
        <strong>Set {{ setNumber }}</strong>
        <span class="muted">a {{ target }}</span>
      </div>
      <div class="setsWon num" aria-label="Set vinti">
        <span class="team-a">{{ setsWon[0] }}</span>–<span class="team-b">{{ setsWon[1] }}</span>
      </div>
    </header>

    <section class="board">
      <div v-for="t in [0, 1] as Team[]" :key="t" class="side" :class="[`t${t}`, { mano: manoTeam === t && setWinner === null && !s.awaitingFirstMano }]">
        <div class="players">
          <PlayerAvatar v-for="seat in seatsOfTeam(t)" :key="seat" :player="s.seats[seat]" :size="28" />
        </div>
        <div class="names">{{ teamName(t) }}</div>
        <div class="score num" aria-live="polite">{{ score[t] }}</div>
        <div class="bar-track" aria-hidden="true">
          <div class="bar-fill" :style="{ width: `${Math.min(100, (score[t] / target) * 100)}%` }" />
        </div>
        <div class="to-go muted">
          {{ score[t] >= target ? "arrivati" : `ne mancano ${target - score[t]}` }}
        </div>
      </div>
    </section>

    <section v-if="setWinner === null && s.awaitingFirstMano" class="denari">
      <p class="prompt">
        <template v-if="setNumber > 1">Bella! </template>Carte date. <strong>Chi ha il 4 di denari?</strong>
      </p>
      <p class="muted">Inizia lui di mano, poi il giro va avanti da solo.</p>
      <div class="mano-pick">
        <button
          v-for="seat in [0, 1, 2, 3] as Seat[]"
          :key="seat"
          :class="`t${teamOfSeat(seat)}`"
          @click="live.setMano(seat)"
        >
          <PlayerAvatar :player="s.seats[seat]" :size="40" />
          <span>{{ s.seats[seat].name }}</span>
        </button>
      </div>
      <template v-if="setNumber > 1">
        <button class="btn ghost block" @click="live.setMano(manoSeat)">
          Niente 4 di denari: continua il giro ({{ s.seats[manoSeat].name }})
        </button>
        <button class="btn ghost block" @click="undo">↶ Torna alla fine del set</button>
      </template>
    </section>

    <template v-else-if="setWinner === null">
      <button class="mano-line" @click="choosingMano = true">
        <span class="label">Di mano</span>
        <PlayerAvatar :player="s.seats[manoSeat]" :size="30" />
        <strong :class="manoTeam === 0 ? 'team-a' : 'team-b'">{{ s.seats[manoSeat].name }}</strong>
        <span class="change muted">cambia</span>
      </button>

      <p class="prompt">Punti della coppia <strong :class="manoTeam === 0 ? 'team-a' : 'team-b'">di mano</strong></p>
      <div class="keypad" role="radiogroup" aria-label="Punti della coppia di mano">
        <button
          v-for="n in HAND_POINTS + 1"
          :key="n"
          role="radio"
          class="key num"
          :class="[{ on: points === n - 1 }, `t${manoTeam}`]"
          :aria-checked="points === n - 1"
          @click="points = n - 1"
        >
          {{ n - 1 }}
        </button>
      </div>

      <div class="maraffa" :class="{ on: maraffa }">
        <button class="maraffa-toggle" :aria-pressed="maraffa" @click="maraffa = !maraffa">
          <span class="suit">A·2·3</span>
          <span>Maraffa <strong>+{{ MARAFFA_BONUS }}</strong></span>
        </button>
        <div v-if="maraffa" class="who-maraffa" role="radiogroup" aria-label="Chi aveva la maraffa">
          <button
            v-for="seat in [0, 1, 2, 3] as Seat[]"
            :key="seat"
            role="radio"
            :aria-checked="maraffaSeat === seat"
            :class="[{ on: maraffaSeat === seat }, `t${teamOfSeat(seat)}`]"
            @click="maraffaSeat = seat"
          >
            <PlayerAvatar :player="s.seats[seat]" :size="26" />
            <span>{{ s.seats[seat].name }}</span>
          </button>
        </div>
      </div>

      <div class="actions">
        <button class="btn ghost" :disabled="live.handCount === 0" @click="undo">↶ Annulla</button>
        <button class="btn record" :disabled="points === null" @click="record">
          <template v-if="preview">
            Registra <span class="num">{{ preview[0] }}–{{ preview[1] }}</span>
          </template>
          <template v-else>Scegli i punti</template>
        </button>
      </div>
    </template>

    <section v-else class="set-over card" :class="`t${setWinner}`">
      <p class="eyebrow">Set {{ setNumber }} vinto da</p>
      <h2>{{ teamName(setWinner) }}</h2>
      <p class="final num">{{ score[0] }}–{{ score[1] }}</p>
      <p class="muted">Set {{ setsWon[0] }}–{{ setsWon[1] }}. Si continua?</p>
      <div class="next">
        <button v-for="t in SET_TARGETS" :key="t" class="btn" @click="nextSet(t)">Set a {{ t }}</button>
      </div>
      <button class="btn block finish" @click="finishing = true">Fine partita</button>
      <button class="btn ghost block" @click="undo">↶ Annulla l'ultima mano</button>
    </section>

    <section v-if="history.length" class="history">
      <h2 class="section-title">Mani del set</h2>
      <ol>
        <li v-for="{ h, i, add } in history" :key="i">
          <span class="n num">{{ i + 1 }}</span>
          <PlayerAvatar :player="s.seats[h.manoSeat]" :size="22" />
          <span class="by">{{ s.seats[h.manoSeat].name }}</span>
          <span v-if="h.maraffaSeat !== null" class="m">maraffa {{ s.seats[h.maraffaSeat].name }}</span>
          <span class="pts num"><span class="team-a">+{{ add[0] }}</span> <span class="team-b">+{{ add[1] }}</span></span>
        </li>
      </ol>
    </section>

    <BottomSheet :open="choosingMano" title="Chi è di mano?" @close="choosingMano = false">
      <p class="muted">
        Il giro passa da solo al giocatore successivo. Cambialo se avete sbagliato, o se questo set si riparte dal 4
        di denari.
      </p>
      <div class="mano-pick">
        <button
          v-for="seat in [0, 1, 2, 3] as Seat[]"
          :key="seat"
          :class="[{ on: manoSeat === seat }, `t${teamOfSeat(seat)}`]"
          @click="chooseMano(seat)"
        >
          <PlayerAvatar :player="s.seats[seat]" :size="36" />
          <span>{{ s.seats[seat].name }}</span>
        </button>
      </div>
    </BottomSheet>

    <BottomSheet :open="finishing" title="Fine partita" @close="finishing = false">
      <div v-if="result" class="summary">
        <p v-if="result.winner === null" class="big">Pareggio, {{ result.setsWon[0] }}–{{ result.setsWon[1] }}</p>
        <p v-else class="big">
          Vince <strong :class="result.winner === 0 ? 'team-a' : 'team-b'">{{ teamName(result.winner) }}</strong>
          <span class="num">{{ result.setsWon[0] }}–{{ result.setsWon[1] }}</span>
        </p>
        <ul class="muted">
          <li v-for="(r, i) in result.sets" :key="i">
            Set {{ i + 1 }}: <span class="num">{{ r.score[0] }}–{{ r.score[1] }}</span>
            <em v-if="r.winner === null && s.sets[i]!.hands.length"> (non finito: conta per le statistiche, non per la classifica)</em>
          </li>
        </ul>
      </div>
      <button class="btn block" :disabled="sending" @click="save">{{ sending ? "Invio…" : "Salva e invia" }}</button>
      <button class="btn ghost block" style="margin-top: 8px" @click="finishing = false">Continua a giocare</button>
    </BottomSheet>

    <BottomSheet :open="menu" title="Partita" @close="menu = false">
      <div class="menu">
        <RouterLink to="/" class="btn ghost block">Vai alla classifica <small class="muted">(la partita resta qui)</small></RouterLink>
        <button class="btn ghost block" :disabled="live.handCount === 0" @click="menu = false; finishing = true">
          Termina adesso
        </button>
        <button v-if="!confirmDiscard" class="btn danger block" @click="confirmDiscard = true">Scarta la partita</button>
        <button v-else class="btn danger block" @click="discard">Sicuro? Scarta senza salvare</button>
      </div>
    </BottomSheet>
  </main>
</template>

<style scoped>
.live {
  max-width: 640px;
  margin: 0 auto;
  padding: calc(8px + env(safe-area-inset-top)) 14px calc(24px + env(safe-area-inset-bottom));
}
.bar {
  display: grid;
  grid-template-columns: 72px 1fr 72px;
  align-items: center;
  margin-bottom: 10px;
}
.icon {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--card);
  font-size: 1.1rem;
  cursor: pointer;
}
.setinfo {
  text-align: center;
  display: grid;
  line-height: 1.15;
}
.setsWon {
  white-space: nowrap;
  text-align: right;
  font-size: 1.4rem;
  font-weight: 800;
}

.board {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.side {
  position: relative;
  display: grid;
  gap: 2px;
  padding: 12px 12px 10px;
  border-radius: var(--radius);
  border: 2px solid transparent;
  background: var(--card);
  box-shadow: var(--shadow);
}
.t0.side {
  --tc: var(--team-a);
  --ts: var(--team-a-soft);
}
.t1.side {
  --tc: var(--team-b);
  --ts: var(--team-b-soft);
}
.side.mano {
  border-color: var(--tc);
  background: var(--ts);
}
.side.mano::after {
  content: "di mano";
  position: absolute;
  top: -9px;
  right: 10px;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--tc);
  color: #fff;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.players {
  display: flex;
}
.players > :last-child {
  margin-left: -6px;
}
.names {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--tc);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.score {
  font-size: clamp(3.2rem, 17vw, 4.6rem);
  font-weight: 800;
  line-height: 1;
  margin: 4px 0 6px;
}
.bar-track {
  height: 6px;
  border-radius: 999px;
  background: var(--paper-2);
  overflow: hidden;
}
.bar-fill {
  height: 100%;
  background: var(--tc);
  transition: width 0.3s ease;
}
.to-go {
  font-size: 0.75rem;
  margin-top: 2px;
}

.mano-line {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 14px 0 4px;
  padding: 8px 12px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--card);
  cursor: pointer;
}
.mano-line .label {
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--ink-2);
}
.mano-line .change {
  margin-left: auto;
  font-size: 0.85rem;
  text-decoration: underline;
}
.prompt {
  margin: 12px 0 8px;
  font-weight: 600;
}

.keypad {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.key {
  min-height: 58px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--line);
  background: var(--card);
  font-size: 1.6rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.06s ease;
}
.key:active {
  transform: scale(0.95);
}
.key.on.t0 {
  background: var(--team-a);
  border-color: var(--team-a);
  color: #fff;
}
.key.on.t1 {
  background: var(--team-b);
  border-color: var(--team-b);
  color: #fff;
}

.maraffa {
  margin-top: 12px;
  border-radius: var(--radius);
  border: 1.5px solid var(--line);
  background: var(--card);
  overflow: hidden;
}
.maraffa.on {
  border-color: var(--gold);
  background: var(--gold-soft);
}
.maraffa-toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 0 14px;
  border: 0;
  background: transparent;
  font-weight: 600;
  cursor: pointer;
}
.suit {
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--gold);
  color: #2a1f17;
  font-family: var(--display);
  font-weight: 800;
  font-size: 0.9rem;
}
.who-maraffa {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  padding: 0 10px 10px;
}
.who-maraffa button,
.mano-pick button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--line);
  background: var(--card);
  font-weight: 600;
  cursor: pointer;
  overflow: hidden;
}
.who-maraffa button span:last-child,
.mano-pick button span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.who-maraffa .on,
.mano-pick .on {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}
.mano-pick {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.denari {
  display: grid;
  gap: 4px;
  margin-top: 8px;
}
.denari .muted {
  margin: 0 0 10px;
}
.denari .mano-pick button {
  min-height: 64px;
  font-size: 1.05rem;
}
.denari .t0 {
  border-color: var(--team-a);
}
.denari .t1 {
  border-color: var(--team-b);
}
.denari .btn {
  margin-top: 10px;
}

.actions {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 10px;
  margin-top: 14px;
}
.record {
  min-height: 56px;
  font-size: 1.1rem;
}

.set-over {
  margin-top: 16px;
  padding: 20px 16px;
  text-align: center;
  display: grid;
  gap: 8px;
}
.set-over.t0 {
  border-color: var(--team-a);
}
.set-over.t1 {
  border-color: var(--team-b);
}
.eyebrow {
  margin: 0;
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-2);
}
.set-over h2 {
  font-size: 1.6rem;
}
.set-over.t0 h2 {
  color: var(--team-a);
}
.set-over.t1 h2 {
  color: var(--team-b);
}
.final {
  margin: 0;
  font-size: 2.4rem;
  font-weight: 800;
}
.set-over p {
  margin: 0;
}
.next {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 6px;
}
.next .btn {
  padding: 0 8px;
}
.finish {
  background: var(--gold);
  border-color: var(--gold);
  color: #2a1f17;
}

.history ol {
  list-style: none;
  margin: 0;
  padding: 0;
}
.history li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 2px;
  border-bottom: 1px solid var(--line);
  font-size: 0.9rem;
}
.history .n {
  width: 22px;
  color: var(--ink-2);
  font-weight: 700;
}
.history .by {
  font-weight: 600;
}
.history .m {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--gold-soft);
}
.history .pts {
  margin-left: auto;
  font-weight: 700;
}

.summary .big {
  font-size: 1.25rem;
  margin: 0 0 8px;
}
.summary ul {
  margin: 0 0 16px;
  padding-left: 18px;
}
.menu {
  display: grid;
  gap: 10px;
}
</style>
