<script setup lang="ts">
import type { PlayerDTO } from "@maraffometro/shared";
import PlayerAvatar from "./PlayerAvatar.vue";

defineProps<{ player: PlayerDTO; link?: boolean; size?: number }>();
</script>

<template>
  <component
    :is="link ? 'RouterLink' : 'span'"
    :to="link ? `/giocatori/${player.id}` : undefined"
    class="chip"
  >
    <PlayerAvatar :player="player" :size="size ?? 26" />
    <span class="name">{{ player.name }}</span>
    <span v-if="player.isGuest" class="guest" title="Ospite: non ha ancora fatto l'accesso">ospite</span>
  </component>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  text-decoration: none;
}
.name {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.guest {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-2);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 1px 6px;
}
</style>
