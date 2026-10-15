<script setup lang="ts">
import { computed } from "vue";
import type { MatchSummaryDTO } from "@maraffometro/shared";
import PlayerAvatar from "./PlayerAvatar.vue";

const props = defineProps<{ match: MatchSummaryDTO; viewpoint?: string }>();

const teams = computed(() => [
  [props.match.seats[0], props.match.seats[2]],
  [props.match.seats[1], props.match.seats[3]],
]);

/** When shown on a player's page, from that player's side: won, lost or level. */
const outcome = computed(() => {
  if (!props.viewpoint) return null;
  const seat = props.match.seats.findIndex((p) => p.id === props.viewpoint);
  if (seat < 0) return null;
  if (props.match.winner === null) return "D";
  return props.match.winner === seat % 2 ? "W" : "L";
});

const when = computed(() =>
  new Date(props.match.playedAt).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" }),
);
</script>

<template>
  <RouterLink :to="`/matches/${match.id}`" class="match card" :class="{ voided: match.voided }">
    <div class="meta">
      <span>{{ when }}</span>
      <span v-if="match.voided" class="tag">annullata</span>
      <span v-else-if="outcome" class="tag" :class="outcome">{{ outcome === "W" ? "Vinta" : outcome === "L" ? "Persa" : "Pari" }}</span>
    </div>
    <div class="body">
      <div v-for="(team, t) in teams" :key="t" class="side" :class="[`t${t}`, { won: match.winner === t }]">
        <div class="avatars">
          <PlayerAvatar v-for="p in team" :key="p.id" :player="p" :size="30" />
        </div>
        <div class="names">{{ team.map((p) => p.name).join(" & ") }}</div>
        <div class="sets num">{{ match.setsWon[t] }}</div>
      </div>
    </div>
    <div class="scores">
      <span v-for="(s, i) in match.sets" :key="i" class="num" :class="{ open: s.winner === null }">
        {{ s.score[0] }}–{{ s.score[1] }}<small>/{{ s.target }}</small>
      </span>
    </div>
  </RouterLink>
</template>

<style scoped>
.match {
  display: block;
  padding: 12px 14px;
  text-decoration: none;
}
.voided {
  opacity: 0.55;
}
.meta {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: var(--ink-2);
}
.meta > :first-child::first-letter {
  text-transform: uppercase;
}
.tag {
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.7rem;
}
.tag.W {
  color: var(--ok);
}
.tag.L {
  color: var(--danger);
}
.body {
  display: grid;
  gap: 6px;
  margin: 8px 0;
}
.side {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
}
.avatars {
  display: flex;
}
.avatars > :last-child {
  margin-left: -8px;
}
.names {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sets {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--ink-2);
}
.won .sets {
  color: var(--ink);
}
.won.t0 .sets {
  color: var(--team-a);
}
.won.t1 .sets {
  color: var(--team-b);
}
.won .names {
  font-weight: 800;
}
.scores {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  font-size: 0.9rem;
  color: var(--ink-2);
}
.scores small {
  font-size: 0.7em;
  opacity: 0.7;
}
.scores .open {
  font-style: italic;
}
</style>
