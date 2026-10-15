<script setup lang="ts">
import { computed, ref } from "vue";
import { handScore, teamOfSeat, type Team } from "@maraffometro/shared";
import { useMatch, useVoidMatch } from "@/api/queries";
import PlayerChip from "@/components/PlayerChip.vue";

const props = defineProps<{ id: string }>();
const { data: match, isLoading, error } = useMatch(() => props.id);
const voidMatch = useVoidMatch();
const confirming = ref(false);
const openSet = ref<number | null>(null);

const teams = computed(() =>
  match.value
    ? ([0, 1] as Team[]).map((t) => ({ t, players: [match.value!.seats[t], match.value!.seats[t + 2]!] }))
    : [],
);
const change = (playerId: string) => match.value?.ratingChanges.find((c) => c.playerId === playerId);
const when = computed(() =>
  match.value
    ? new Date(match.value.playedAt).toLocaleString("it-IT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "",
);

async function doVoid() {
  await voidMatch.mutateAsync(props.id);
  confirming.value = false;
}
</script>

<template>
  <main class="page">
    <RouterLink to="/partite" class="back muted">← Partite</RouterLink>
    <p v-if="isLoading" class="muted">Carico…</p>
    <p v-else-if="error" class="error">{{ error.message }}</p>

    <template v-else-if="match">
      <p class="when muted">{{ when }}</p>
      <p v-if="match.voided" class="voided">Partita annullata: non conta per classifica e statistiche.</p>

      <section class="result card">
        <div v-for="{ t, players } in teams" :key="t" class="team" :class="[`t${t}`, { won: match.winner === t }]">
          <div class="players">
            <div v-for="p in players" :key="p.id" class="p">
              <PlayerChip :player="p" link :size="34" />
              <span v-if="change(p.id)" class="delta num" :class="change(p.id)!.after >= change(p.id)!.before ? 'up' : 'down'">
                {{ change(p.id)!.after >= change(p.id)!.before ? "+" : "−" }}{{ Math.abs(change(p.id)!.after - change(p.id)!.before) }}
              </span>
            </div>
          </div>
          <div class="sets num">{{ match.setsWon[t] }}</div>
        </div>
        <p class="verdict">
          <template v-if="match.winner === null">Pareggio</template>
          <template v-else>Vince la coppia {{ match.winner === 0 ? "A" : "B" }}</template>
        </p>
      </section>

      <h2 class="section-title">Set</h2>
      <div class="sets-list">
        <div v-for="(s, i) in match.sets" :key="i" class="set card">
          <button class="set-head" :aria-expanded="openSet === i" @click="openSet = openSet === i ? null : i">
            <span class="label">Set {{ i + 1 }} <small class="muted">a {{ s.target }}</small></span>
            <span class="num score">
              <span class="team-a" :class="{ w: s.winner === 0 }">{{ s.score[0] }}</span>
              –
              <span class="team-b" :class="{ w: s.winner === 1 }">{{ s.score[1] }}</span>
            </span>
            <small v-if="s.winner === null" class="muted">non finito</small>
            <span class="chev" aria-hidden="true">{{ openSet === i ? "▴" : "▾" }}</span>
          </button>
          <ol v-if="openSet === i" class="hands">
            <li v-for="(h, j) in match.hands[i]" :key="j">
              <span class="n num">{{ j + 1 }}</span>
              <span :class="teamOfSeat(h.manoSeat) === 0 ? 'team-a' : 'team-b'">{{ match.seats[h.manoSeat].name }}</span>
              <span v-if="h.maraffaSeat !== null" class="m">maraffa {{ match.seats[h.maraffaSeat].name }}</span>
              <span class="pts num">
                <span class="team-a">{{ handScore(h)[0] }}</span> · <span class="team-b">{{ handScore(h)[1] }}</span>
              </span>
            </li>
          </ol>
        </div>
      </div>

      <p class="muted small">Registrata da {{ match.recordedBy.name }}.</p>

      <template v-if="match.canVoid">
        <button v-if="!confirming" class="btn danger small" @click="confirming = true">Annulla questa partita</button>
        <div v-else class="confirm card">
          <p>La partita sparirà da classifica e statistiche per tutti. Va fatto solo se è sbagliata o finta.</p>
          <div class="row">
            <button class="btn danger small" :disabled="voidMatch.isPending.value" @click="doVoid">Sì, annulla</button>
            <button class="btn ghost small" @click="confirming = false">No</button>
          </div>
          <p v-if="voidMatch.error.value" class="error">{{ voidMatch.error.value.message }}</p>
        </div>
      </template>
    </template>
  </main>
</template>

<style scoped>
.back {
  text-decoration: none;
  font-weight: 600;
}
.when {
  margin: 12px 0 10px;
}
.when::first-letter {
  text-transform: uppercase;
}
.voided {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--team-a-soft);
  font-weight: 600;
}
.result {
  padding: 12px 14px;
}
.team {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  padding: 8px 0;
}
.team + .team {
  border-top: 1px dashed var(--line);
}
.players {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.p {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.delta {
  font-size: 0.85rem;
  font-weight: 700;
}
.up {
  color: var(--ok);
}
.down {
  color: var(--danger);
}
.sets {
  font-size: 2.6rem;
  font-weight: 800;
  color: var(--ink-2);
}
.won.t0 .sets {
  color: var(--team-a);
}
.won.t1 .sets {
  color: var(--team-b);
}
.verdict {
  margin: 6px 0 0;
  text-align: center;
  font-weight: 700;
}
.sets-list {
  display: grid;
  gap: 8px;
}
.set-head {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 0 14px;
  border: 0;
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.set-head .label {
  font-weight: 700;
}
.score {
  margin-left: auto;
  font-size: 1.3rem;
  font-weight: 700;
}
.score .w {
  font-weight: 800;
  text-decoration: underline;
  text-underline-offset: 4px;
}
.chev {
  color: var(--ink-2);
}
.hands {
  list-style: none;
  margin: 0;
  padding: 0 14px 10px;
}
.hands li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid var(--line);
  font-size: 0.9rem;
}
.n {
  width: 20px;
  color: var(--ink-2);
}
.m {
  font-size: 0.72rem;
  font-weight: 800;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--gold-soft);
}
.pts {
  margin-left: auto;
  font-weight: 700;
}
.small {
  font-size: 0.85rem;
  margin-top: 18px;
}
.confirm {
  padding: 14px;
}
.confirm p {
  margin-top: 0;
}
.row {
  display: flex;
  gap: 8px;
}
</style>
