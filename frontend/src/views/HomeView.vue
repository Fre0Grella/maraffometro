<script setup lang="ts">
import { computed, ref } from "vue";
import { useLeaderboard, useMatches, useMe } from "@/api/queries";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import MatchCard from "@/components/MatchCard.vue";
import BottomSheet from "@/components/BottomSheet.vue";
import AppFooter from "@/components/AppFooter.vue";
import InstallCard from "@/components/InstallCard.vue";

const { data: board, isLoading, error } = useLeaderboard();
const { data: matches } = useMatches(undefined, 3);
const { data: me } = useMe();
const explain = ref(false);

const anyProvisional = computed(() => (board.value ?? []).some((e) => e.provisional));
/** Podium colours only once a position is for real. */
const podium = (rank: number, provisional: boolean) =>
  !provisional && rank <= 3 ? ["", "gold", "silver", "bronze"][rank] : "";
</script>

<template>
  <main class="page">
    <div class="head">
      <h1>Classifica</h1>
      <button class="btn small ghost" @click="explain = true">Come funziona?</button>
    </div>

    <InstallCard />

    <p v-if="isLoading" class="muted">Carico la classifica…</p>
    <p v-else-if="error" class="error">{{ error.message }}</p>

    <section v-else-if="!board?.length" class="empty card">
      <h2>Il tavolo è vuoto</h2>
      <p class="muted">Nessuna partita registrata ancora. La prima classifica nasce dalla prima partita.</p>
      <RouterLink v-if="me" to="/new" class="btn">Inizia una partita</RouterLink>
      <RouterLink v-else to="/login" class="btn">Accedi per iniziare</RouterLink>
    </section>

    <template v-else>
      <ol class="board card">
        <li
          v-for="e in board"
          :key="e.player.id"
          :class="{ mine: e.player.id === me?.id, provisional: e.provisional }"
        >
          <RouterLink :to="`/players/${e.player.id}`" class="row">
            <span
              class="rank num"
              :class="podium(e.rank, e.provisional)"
              :title="e.provisional ? 'Posizione provvisoria' : undefined"
            >
              {{ e.rank }}
            </span>
            <PlayerAvatar :player="e.player" :size="40" />
            <span class="who">
              <strong>{{ e.player.name }}</strong>
              <small class="muted">
                <template v-if="e.provisional">
                  <span class="trial">provvisorio · {{ e.setsPlayed }}/8 set</span>
                </template>
                <template v-else>
                  {{ e.setsWon }}–{{ e.setsPlayed - e.setsWon }} set · {{ e.matchesPlayed }} partite
                </template>
              </small>
            </span>
            <span class="score">
              <span class="num rating">{{ e.rating }}</span>
              <small v-if="e.lastChange" class="delta" :class="e.lastChange > 0 ? 'up' : 'down'">
                {{ e.lastChange > 0 ? "▲" : "▼" }}{{ Math.abs(e.lastChange) }}
              </small>
            </span>
          </RouterLink>
        </li>
      </ol>
      <p v-if="anyProvisional" class="legend muted">
        <span class="rank-sample num">4</span> posizione provvisoria: diventa definitiva dopo 8 set giocati.
      </p>
    </template>

    <template v-if="matches?.length">
      <div class="head sub">
        <h2 class="section-title">Ultime partite</h2>
        <RouterLink to="/matches" class="muted">Tutte →</RouterLink>
      </div>
      <div class="matches">
        <MatchCard v-for="m in matches" :key="m.id" :match="m" />
      </div>
    </template>

    <AppFooter />

    <BottomSheet :open="explain" title="Come funziona la classifica" @close="explain = false">
      <div class="explain">
        <p>
          Il punteggio stima quanto sei forte <strong>tenendo conto di chi avevi in coppia e contro chi giocavi</strong>.
          Vincere con il più forte del gruppo vale meno che vincere con chi perde sempre.
        </p>
        <p>
          <strong>Giocare tanto non fa salire.</strong> Conta come giochi, non quanto: chi ha poche partite viene tenuto
          vicino alla media (1500) finché i risultati non dicono altro. Compari in classifica dal primo set, ma la tua
          posizione resta provvisoria fino a 8 set.
        </p>
        <p>
          Ogni <strong>set</strong> conta; vincerlo largo conta un po' di più (ma 41–0 non vale il triplo di 41–38). I
          set a 51 pesano più di quelli a 31: più mani, meno fortuna. Chiudere la <strong>partita</strong> dà un piccolo
          extra.
        </p>
        <p>
          Le partite vecchie contano via via meno (metà peso dopo sei mesi), così la classifica segue come si gioca
          adesso.
        </p>
        <p class="muted">
          Sotto il cofano: un modello Bradley–Terry bayesiano ricalcolato su tutta la storia a ogni partita, parente di
          Elo e TrueSkill. I dettagli sono nel README del progetto.
        </p>
      </div>
    </BottomSheet>
  </main>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 8px 0 16px;
}
.head.sub {
  margin: 0;
}
.head.sub .section-title {
  margin-bottom: 10px;
}
h1 {
  font-size: 2.1rem;
}
.empty {
  padding: 28px 20px;
  text-align: center;
  display: grid;
  gap: 10px;
  justify-items: center;
}
.board {
  list-style: none;
  margin: 0;
  padding: 4px;
}
.board li + li {
  border-top: 1px solid var(--line);
}
.row {
  display: grid;
  grid-template-columns: 30px auto 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 10px 10px;
  text-decoration: none;
  border-radius: var(--radius-sm);
}
.mine .row {
  background: var(--gold-soft);
}
.rank {
  text-align: center;
  font-weight: 800;
  font-size: 1.1rem;
  color: var(--ink-2);
}
.rank.gold {
  color: var(--gold);
  font-size: 1.4rem;
}
.rank.silver {
  color: #8f8a83;
  font-size: 1.25rem;
}
.rank.bronze {
  color: #a8693a;
  font-size: 1.2rem;
}
.who {
  display: grid;
  min-width: 0;
}
.who strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.who small {
  font-size: 0.8rem;
}
.score {
  display: grid;
  justify-items: end;
}
.rating {
  font-size: 1.45rem;
  font-weight: 800;
}
.provisional .rank,
.rank-sample {
  display: inline-grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1.5px dashed var(--ink-2);
  font-size: 0.95rem;
}
.trial {
  font-weight: 600;
}
.legend {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 4px 0;
  font-size: 0.82rem;
}
.rank-sample {
  flex: none;
  width: 22px;
  height: 22px;
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--ink-2);
}
.delta {
  font-size: 0.75rem;
  font-weight: 700;
}
.up {
  color: var(--ok);
}
.down {
  color: var(--danger);
}
.matches {
  display: grid;
  gap: 10px;
}
.explain p {
  margin: 0 0 12px;
}
</style>
