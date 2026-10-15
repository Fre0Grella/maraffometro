<script setup lang="ts">
import { computed, ref } from "vue";
import { useLeaderboard, useMatches, useMe } from "@/api/queries";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import MatchCard from "@/components/MatchCard.vue";
import BottomSheet from "@/components/BottomSheet.vue";

const { data: board, isLoading, error } = useLeaderboard();
const { data: matches } = useMatches(undefined, 3);
const { data: me } = useMe();
const explain = ref(false);

const ranked = computed(() => (board.value ?? []).filter((e) => !e.provisional));
const provisional = computed(() => (board.value ?? []).filter((e) => e.provisional));
const podium = (rank: number) => (rank <= 3 ? ["", "gold", "silver", "bronze"][rank] : "");
</script>

<template>
  <main class="page">
    <div class="head">
      <h1>Classifica</h1>
      <button class="btn small ghost" @click="explain = true">Come funziona?</button>
    </div>

    <p v-if="isLoading" class="muted">Carico la classifica…</p>
    <p v-else-if="error" class="error">{{ error.message }}</p>

    <section v-else-if="!board?.length" class="empty card">
      <h2>Il tavolo è vuoto</h2>
      <p class="muted">Nessuna partita registrata ancora. La prima classifica nasce dalla prima partita.</p>
      <RouterLink v-if="me" to="/nuova" class="btn">Inizia una partita</RouterLink>
      <RouterLink v-else to="/accedi" class="btn">Accedi per iniziare</RouterLink>
    </section>

    <template v-else>
      <ol v-if="ranked.length" class="board card">
        <li v-for="e in ranked" :key="e.player.id" :class="{ mine: e.player.id === me?.id }">
          <RouterLink :to="`/giocatori/${e.player.id}`" class="row">
            <span class="rank num" :class="podium(e.rank)">{{ e.rank }}</span>
            <PlayerAvatar :player="e.player" :size="40" />
            <span class="who">
              <strong>{{ e.player.name }}</strong>
              <small class="muted">{{ e.setsWon }}–{{ e.setsPlayed - e.setsWon }} set · {{ e.matchesPlayed }} partite</small>
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

      <template v-if="provisional.length">
        <h2 class="section-title">In rodaggio <span class="muted">— meno di 8 set giocati</span></h2>
        <ul class="board card provisional">
          <li v-for="e in provisional" :key="e.player.id" :class="{ mine: e.player.id === me?.id }">
            <RouterLink :to="`/giocatori/${e.player.id}`" class="row">
              <span class="rank">·</span>
              <PlayerAvatar :player="e.player" :size="34" />
              <span class="who">
                <strong>{{ e.player.name }}</strong>
                <small class="muted">{{ e.setsPlayed }} set su 8</small>
              </span>
              <span class="score">
                <span class="num rating">~{{ e.rating }}</span>
              </span>
            </RouterLink>
          </li>
        </ul>
      </template>
    </template>

    <template v-if="matches?.length">
      <div class="head sub">
        <h2 class="section-title">Ultime partite</h2>
        <RouterLink to="/partite" class="muted">Tutte →</RouterLink>
      </div>
      <div class="matches">
        <MatchCard v-for="m in matches" :key="m.id" :match="m" />
      </div>
    </template>

    <BottomSheet :open="explain" title="Come funziona la classifica" @close="explain = false">
      <div class="explain">
        <p>
          Il punteggio stima quanto sei forte <strong>tenendo conto di chi avevi in coppia e contro chi giocavi</strong>.
          Vincere con il più forte del gruppo vale meno che vincere con chi perde sempre.
        </p>
        <p>
          <strong>Giocare tanto non fa salire.</strong> Conta come giochi, non quanto: chi ha poche partite viene tenuto
          vicino alla media (1500) finché i risultati non dicono altro, e resta "in rodaggio" fino a 8 set.
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
.provisional .rating {
  font-size: 1.1rem;
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
