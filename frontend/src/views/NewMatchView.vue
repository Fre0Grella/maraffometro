<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { SET_TARGETS, teamOfSeat, type PlayerDTO, type Seat, type SetTarget } from "@maraffometro/shared";
import { useMe } from "@/api/queries";
import { useLiveMatch } from "@/stores/live";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import PlayerPicker from "@/components/PlayerPicker.vue";

const router = useRouter();
const live = useLiveMatch();
const { data: me } = useMe();

const seats = ref<(PlayerDTO | null)[]>([null, null, null, null]);
const target = ref<SetTarget>(41);
const picking = ref<Seat | null>(null);

// Sit the signed-in player at the bottom of the table to start with.
watchEffect(() => {
  if (me.value && !seats.value.some((s) => s !== null)) seats.value[0] = me.value;
});

const ready = computed(() => seats.value.every((s) => s !== null));
const seatedIds = computed(() => seats.value.filter((s): s is PlayerDTO => s !== null).map((s) => s.id));
const meSeated = computed(() => !!me.value && seatedIds.value.includes(me.value.id));

/** Bottom, right, top, left: the lead goes round the table counter-clockwise, as in the game. */
const positions = ["bottom", "right", "top", "left"] as const;

function pick(p: PlayerDTO) {
  if (picking.value !== null) seats.value[picking.value] = p;
  picking.value = null;
}

function clear(seat: Seat) {
  seats.value[seat] = null;
}

function swapPartners() {
  // Swap the two players on the right and left: the other way to split the four into pairs.
  const s = seats.value;
  [s[1], s[3]] = [s[3]!, s[1]!];
}

function rotatePairs() {
  // Different pairs: whoever sits right of the bottom player becomes their partner.
  const s = seats.value;
  [s[1], s[2]] = [s[2]!, s[1]!];
}

function start() {
  if (!ready.value) return;
  live.start(seats.value as [PlayerDTO, PlayerDTO, PlayerDTO, PlayerDTO], target.value);
  router.replace("/table");
}
</script>

<template>
  <main class="page">
    <h1>Nuova partita</h1>

    <section v-if="live.active" class="resume card">
      <p><strong>C'è già una partita in corso</strong> su questo telefono.</p>
      <div class="row">
        <RouterLink to="/table" class="btn small">Riprendi</RouterLink>
        <button class="btn small danger" @click="live.discard()">Scartala</button>
      </div>
    </section>

    <template v-else>
      <p class="muted lead">
        Tocca un posto per sedere un giocatore. I compagni stanno uno di fronte all'altro. Chi ha il 4 di denari lo
        dirai dopo aver dato le carte.
      </p>

      <div class="table" role="group" aria-label="Il tavolo">
        <div class="felt">
          <div class="pairs">
            <span class="team-a">Coppia A</span>
            <span class="team-b">Coppia B</span>
          </div>
        </div>
        <div v-for="(pos, i) in positions" :key="pos" class="seat" :class="[pos, `t${teamOfSeat(i as Seat)}`]">
          <button class="who" @click="picking = i as Seat">
            <template v-if="seats[i]">
              <PlayerAvatar :player="seats[i]!" :size="52" />
              <span class="name">{{ seats[i]!.name }}</span>
            </template>
            <template v-else>
              <span class="empty">+</span>
              <span class="name muted">Siedi</span>
            </template>
          </button>
          <button v-if="seats[i]" class="x" :aria-label="`Togli ${seats[i]!.name}`" @click="clear(i as Seat)">✕</button>
        </div>
      </div>

      <div class="tools">
        <button class="btn small ghost" :disabled="!ready" @click="rotatePairs">Cambia coppie</button>
        <button class="btn small ghost" :disabled="!ready" @click="swapPartners">Scambia destra/sinistra</button>
      </div>

      <h2 class="section-title">Primo set a</h2>
      <div class="targets" role="radiogroup" aria-label="Punti del primo set">
        <button
          v-for="t in SET_TARGETS"
          :key="t"
          role="radio"
          :aria-checked="target === t"
          class="target num"
          :class="{ on: target === t }"
          @click="target = t"
        >
          {{ t }}
        </button>
      </div>
      <p class="muted hint">La lunghezza dei set successivi la scegli alla fine di ognuno.</p>

      <p v-if="ready && !meSeated" class="error">Per registrare la partita devi essere seduto al tavolo.</p>
      <button class="btn block go" :disabled="!ready || !meSeated" @click="start">Si gioca</button>
    </template>

    <PlayerPicker
      :open="picking !== null"
      :exclude="seatedIds"
      :title="picking === null ? '' : `Chi siede ${['in basso', 'a destra', 'in alto', 'a sinistra'][picking]}?`"
      @close="picking = null"
      @pick="pick"
    />
  </main>
</template>

<style scoped>
h1 {
  font-size: 2rem;
  margin: 8px 0 6px;
}
.lead {
  margin: 0 0 18px;
}
.resume {
  padding: 16px;
  margin-top: 16px;
}
.resume .row {
  display: flex;
  gap: 10px;
}
.table {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1.25fr 1fr;
  grid-template-rows: auto 150px auto;
  grid-template-areas:
    ". top ."
    "left felt right"
    ". bottom .";
  gap: 6px;
  align-items: center;
  justify-items: center;
}
.felt {
  grid-area: felt;
  width: 100%;
  height: 100%;
  border-radius: 22px;
  background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--felt) 80%, #fff 8%), var(--felt));
  box-shadow: inset 0 0 0 6px color-mix(in srgb, var(--felt) 70%, #000 30%);
  display: grid;
  place-items: center;
}
.pairs {
  display: grid;
  gap: 4px;
  text-align: center;
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.pairs .team-a {
  color: #f6c4b4;
}
.pairs .team-b {
  color: #b8e3cc;
}
.seat {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 4px;
}
.top {
  grid-area: top;
}
.bottom {
  grid-area: bottom;
}
.left {
  grid-area: left;
}
.right {
  grid-area: right;
}
.who {
  display: grid;
  justify-items: center;
  gap: 4px;
  min-width: 84px;
  padding: 6px;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
}
.name {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 700;
  font-size: 0.9rem;
}
.t0 .name {
  color: var(--team-a);
}
.t1 .name {
  color: var(--team-b);
}
.empty {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 2px dashed var(--ink-2);
  font-size: 1.5rem;
  color: var(--ink-2);
}
.t0 .empty {
  border-color: var(--team-a);
  color: var(--team-a);
}
.t1 .empty {
  border-color: var(--team-b);
  color: var(--team-b);
}
.x {
  position: absolute;
  top: 0;
  right: 4px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: var(--card);
  font-size: 0.7rem;
  cursor: pointer;
}
.tools {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 14px;
}
.targets {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.target {
  min-height: 64px;
  border-radius: var(--radius);
  border: 2px solid var(--line);
  background: var(--card);
  font-size: 1.8rem;
  font-weight: 800;
  cursor: pointer;
}
.target.on {
  border-color: var(--ink);
  background: var(--ink);
  color: var(--paper);
}
.hint {
  font-size: 0.85rem;
}
.go {
  margin-top: 18px;
  min-height: 56px;
  font-size: 1.1rem;
  background: var(--team-a);
  border-color: var(--team-a);
  color: #fff;
}
</style>
