<script setup lang="ts">
import type { PlayerDTO } from "@maraffometro/shared";

withDefaults(defineProps<{ player: Pick<PlayerDTO, "emoji" | "color" | "name">; size?: number }>(), { size: 40 });
</script>

<template>
  <span
    class="avatar"
    :style="{ '--c': player.color, width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.52}px` }"
    :title="player.name"
    role="img"
    :aria-label="player.name"
  >{{ player.emoji }}</span>
</template>

<style scoped>
.avatar {
  display: inline-grid;
  place-items: center;
  flex: none;
  border-radius: 50%;
  background: color-mix(in srgb, var(--c) 22%, var(--card));
  box-shadow: inset 0 0 0 2px var(--c);
  line-height: 1;
  user-select: none;
}
</style>
