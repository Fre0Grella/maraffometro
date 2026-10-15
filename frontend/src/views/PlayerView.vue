<script setup lang="ts">
import { computed } from "vue";
import type { PartnerStatDTO } from "@maraffometro/shared";
import { useClaimCode, useMe, usePlayerStats } from "@/api/queries";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import PlayerChip from "@/components/PlayerChip.vue";
import MatchCard from "@/components/MatchCard.vue";
import FormDots from "@/components/FormDots.vue";

const props = defineProps<{ id: string }>();
const { data: stats, isLoading, error } = usePlayerStats(() => props.id);
const { data: me } = useMe();
const claimCode = useClaimCode();

const isMe = computed(() => me.value?.id === props.id);
const pct = (won: number, played: number) => (played ? `${Math.round((won / played) * 100)}%` : "—");
const avg = (n: number | null) => (n === null ? "—" : n.toFixed(1).replace(".", ","));
const partnerLine = (p: PartnerStatDTO) => `${p.setsWon} su ${p.sets} set · ${pct(p.setsWon, p.sets)}`;
</script>

<template>
  <main class="page">
    <p v-if="isLoading" class="muted">Carico…</p>
    <p v-else-if="error" class="error">{{ error.message }}</p>

    <template v-else-if="stats">
      <header class="hero" :style="{ '--c': stats.player.color }">
        <PlayerAvatar :player="stats.player" :size="84" />
        <div class="id">
          <h1>{{ stats.player.name }}</h1>
          <p v-if="stats.player.motto" class="motto">“{{ stats.player.motto }}”</p>
          <p v-if="stats.player.isGuest" class="muted guest">Profilo ospite</p>
        </div>
      </header>

      <section class="rating card">
        <template v-if="stats.leaderboard">
          <div>
            <span class="label">Punteggio</span>
            <span class="num big">{{ stats.leaderboard.rating }}</span>
            <span class="muted pm">± {{ stats.leaderboard.uncertainty }}</span>
          </div>
          <div class="rank">
            <span class="label">{{ stats.leaderboard.provisional ? "Posizione provvisoria" : "Posizione" }}</span>
            <span class="num big" :class="{ temp: stats.leaderboard.provisional }">{{ stats.leaderboard.rank }}°</span>
            <span v-if="stats.leaderboard.provisional" class="muted sets">
              {{ stats.leaderboard.setsPlayed }}/8 set per renderla definitiva
            </span>
          </div>
        </template>
        <p v-else class="muted">Ancora nessun set finito: niente punteggio per ora.</p>
      </section>

      <section v-if="stats.form.length" class="form-row">
        <span class="label">Forma</span>
        <FormDots :form="stats.form" />
      </section>

      <h2 class="section-title">Numeri</h2>
      <div class="grid">
        <div class="tile card">
          <span class="num v">{{ stats.matchesWon }}<small>/{{ stats.matchesPlayed }}</small></span>
          <span class="k">partite vinte</span>
        </div>
        <div class="tile card">
          <span class="num v">{{ pct(stats.setsWon, stats.setsPlayed) }}</span>
          <span class="k">set vinti ({{ stats.setsWon }}/{{ stats.setsPlayed }})</span>
        </div>
        <div class="tile card gold">
          <span class="num v">{{ stats.maraffas }}</span>
          <span class="k">maraffe fatte</span>
        </div>
        <div class="tile card">
          <span class="num v">{{ stats.maraffasAgainst }}</span>
          <span class="k">maraffe subite</span>
        </div>
        <div class="tile card">
          <span class="num v">{{ avg(stats.avgPointsMano) }}</span>
          <span class="k">media punti di mano</span>
        </div>
        <div class="tile card">
          <span class="num v">{{ avg(stats.avgPointsFuoriMano) }}</span>
          <span class="k">media punti fuori mano</span>
        </div>
      </div>

      <h2 class="section-title">Compagni e avversari</h2>
      <div class="people">
        <div v-if="stats.bestPartner" class="person card">
          <span class="label">Coppia d'oro</span>
          <PlayerChip :player="stats.bestPartner.player" link />
          <small class="muted">{{ partnerLine(stats.bestPartner) }}</small>
        </div>
        <div v-if="stats.worstPartner" class="person card">
          <span class="label">Coppia sfortunata</span>
          <PlayerChip :player="stats.worstPartner.player" link />
          <small class="muted">{{ partnerLine(stats.worstPartner) }}</small>
        </div>
        <div v-if="stats.nemesis" class="person card">
          <span class="label">Bestia nera</span>
          <PlayerChip :player="stats.nemesis.player" link />
          <small class="muted">contro: {{ partnerLine(stats.nemesis) }}</small>
        </div>
        <p v-if="!stats.bestPartner" class="muted">Servono un po' di partite per questi.</p>
      </div>

      <div v-if="isMe" class="mine">
        <RouterLink to="/profile" class="btn ghost block">Modifica il tuo profilo</RouterLink>
      </div>

      <section v-if="stats.player.isGuest && me" class="claim card">
        <p>
          È il profilo di un amico che non ha ancora fatto l'accesso? Genera un codice e mandaglielo: entrando potrà
          reclamare queste partite.
        </p>
        <p v-if="claimCode.data.value" class="code num">{{ claimCode.data.value.code }}</p>
        <p v-if="claimCode.data.value" class="muted">Valido per 7 giorni. Va inserito in Profilo → Reclama.</p>
        <button v-else class="btn small" :disabled="claimCode.isPending.value" @click="claimCode.mutate(stats.player.id)">
          Genera codice
        </button>
        <p v-if="claimCode.error.value" class="error">{{ claimCode.error.value.message }}</p>
      </section>

      <template v-if="stats.recentMatches.length">
        <h2 class="section-title">Ultime partite</h2>
        <div class="matches">
          <MatchCard v-for="m in stats.recentMatches" :key="m.id" :match="m" :viewpoint="stats.player.id" />
        </div>
      </template>
    </template>
  </main>
</template>

<style scoped>
.hero {
  display: flex;
  align-items: center;
  gap: 16px;
  margin: 10px 0 16px;
}
.id {
  min-width: 0;
}
h1 {
  font-size: 2rem;
  overflow-wrap: anywhere;
}
.motto {
  margin: 4px 0 0;
  font-style: italic;
  color: var(--ink-2);
}
.guest {
  margin: 4px 0 0;
  font-size: 0.85rem;
}
.label {
  display: block;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-2);
}
.rating {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 14px 16px;
}
.rating p {
  margin: 0;
}
.big {
  font-size: 2.4rem;
  font-weight: 800;
  line-height: 1;
}
.pm {
  margin-left: 6px;
  font-size: 0.9rem;
}
.rank {
  display: grid;
  justify-items: end;
  text-align: right;
}
.big.temp {
  color: var(--ink-2);
}
.sets {
  font-size: 0.8rem;
}
.form-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
}
.form-row .label {
  display: inline;
}
.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.tile {
  display: grid;
  gap: 2px;
  padding: 12px 14px;
}
.tile.gold {
  background: var(--gold-soft);
  border-color: var(--gold);
}
.v {
  font-size: 1.8rem;
  font-weight: 800;
  line-height: 1.1;
}
.v small {
  font-size: 0.55em;
  color: var(--ink-2);
}
.k {
  font-size: 0.82rem;
  color: var(--ink-2);
  font-weight: 600;
}
.people {
  display: grid;
  gap: 10px;
}
.person {
  display: grid;
  gap: 6px;
  padding: 12px 14px;
}
.mine {
  margin-top: 18px;
}
.claim {
  margin-top: 18px;
  padding: 14px 16px;
}
.claim p {
  margin: 0 0 10px;
}
.code {
  font-size: 2rem;
  font-weight: 800;
  letter-spacing: 0.18em;
}
.matches {
  display: grid;
  gap: 10px;
}
</style>
