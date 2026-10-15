<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useRoute } from "vue-router";
import { useQueryClient } from "@tanstack/vue-query";
import { invalidateResults, useMe } from "@/api/queries";
import { useLiveMatch } from "@/stores/live";
import { useOutbox } from "@/stores/outbox";
import PlayerAvatar from "@/components/PlayerAvatar.vue";

const route = useRoute();
const { data: me } = useMe();
const live = useLiveMatch();
const outbox = useOutbox();
const qc = useQueryClient();

const onTable = computed(() => route.name === "live");
const waiting = computed(() => outbox.pending.filter((p) => !p.error).length);
const refused = computed(() => outbox.pending.filter((p) => p.error).length);

async function flush() {
  if ((await outbox.flush()) > 0) invalidateResults(qc);
}

onMounted(() => {
  flush();
  window.addEventListener("online", flush);
});
onBeforeUnmount(() => window.removeEventListener("online", flush));
</script>

<template>
  <header v-if="!onTable" class="topbar">
    <RouterLink to="/" class="brand" aria-label="Maraffometro, classifica">
      <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">
        <rect x="10" y="6" width="44" height="52" rx="7" fill="var(--card)" stroke="currentColor" stroke-width="3.5" />
        <circle cx="32" cy="32" r="13" fill="var(--team-a)" />
        <circle cx="32" cy="32" r="6" fill="var(--gold)" />
      </svg>
      <span>Maraffometro</span>
    </RouterLink>
    <RouterLink v-if="me" to="/profile" class="me" aria-label="Il tuo profilo">
      <PlayerAvatar :player="me" :size="36" />
    </RouterLink>
    <RouterLink v-else-if="me === null" to="/login" class="btn small">Accedi</RouterLink>
  </header>

  <div v-if="!onTable && (waiting || refused)" class="outbox">
    <template v-if="waiting">
      {{ waiting === 1 ? "1 partita in attesa di invio" : `${waiting} partite in attesa di invio` }}
      <button class="btn small ghost" :disabled="outbox.flushing" @click="flush">Riprova</button>
    </template>
    <template v-else>
      <span>Una partita è stata rifiutata: {{ outbox.pending.find((p) => p.error)?.error }}</span>
      <button class="btn small danger" @click="outbox.drop(outbox.pending.find((p) => p.error)!.match.id)">Scarta</button>
    </template>
  </div>

  <RouterView />

  <nav v-if="!onTable" class="tabbar" aria-label="Navigazione">
    <RouterLink to="/" class="tab" exact-active-class="on">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>
      Classifica
    </RouterLink>
    <RouterLink :to="live.active ? '/table' : '/new'" class="tab play" :class="{ live: live.active }">
      <span class="play-disc">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path v-if="live.active" d="M8 5v14l11-7z" /><path v-else d="M12 5v14M5 12h14" /></svg>
      </span>
      {{ live.active ? "Al tavolo" : "Nuova" }}
    </RouterLink>
    <RouterLink to="/matches" class="tab" active-class="on">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="12" height="16" rx="2" /><path d="M8 21h10a2 2 0 0 0 2-2V7" /></svg>
      Partite
    </RouterLink>
  </nav>
</template>

<style scoped>
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: space-between;
  max-width: 640px;
  margin: 0 auto;
  padding: calc(10px + env(safe-area-inset-top)) 16px 10px;
  background: color-mix(in srgb, var(--paper) 88%, transparent);
  backdrop-filter: blur(8px);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  font-family: var(--display);
  font-weight: 800;
  font-size: 1.3rem;
  letter-spacing: -0.02em;
}
.me {
  display: block;
  border-radius: 50%;
}
.outbox {
  max-width: 608px;
  margin: 4px auto 0;
  padding: 8px 8px 8px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-radius: var(--radius-sm);
  background: var(--gold-soft);
  font-size: 0.9rem;
  font-weight: 600;
}
@media (max-width: 640px) {
  .outbox {
    margin: 4px 16px 0;
  }
}
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: end;
  padding: 6px 12px calc(8px + env(safe-area-inset-bottom));
  background: var(--card);
  border-top: 1px solid var(--line);
}
.tab {
  display: grid;
  justify-items: center;
  gap: 2px;
  padding: 4px 8px;
  font-size: 0.75rem;
  font-weight: 600;
  text-decoration: none;
  color: var(--ink-2);
}
.tab svg {
  width: 24px;
  height: 24px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.tab.on {
  color: var(--ink);
}
.play {
  color: var(--ink);
  margin-top: -22px;
}
.play-disc {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: var(--team-a);
  box-shadow: 0 6px 16px -6px var(--team-a);
  border: 4px solid var(--card);
}
.play-disc svg {
  stroke: #fff;
  stroke-width: 2.6;
}
.play.live .play-disc {
  background: var(--team-b);
  box-shadow: 0 6px 16px -6px var(--team-b);
}
.play.live .play-disc svg {
  fill: #fff;
  stroke: none;
}
</style>
