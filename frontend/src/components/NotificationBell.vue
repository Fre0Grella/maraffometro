<script setup lang="ts">
import { computed } from "vue";
import { useNotifications } from "@/api/queries";

const { data } = useNotifications(true);
const unread = computed(() => data.value?.unread ?? 0);
const label = computed(() =>
  unread.value === 0 ? "Notifiche" : unread.value === 1 ? "Notifiche, 1 da leggere" : `Notifiche, ${unread.value} da leggere`,
);
</script>

<template>
  <RouterLink to="/notifications" class="bell" :aria-label="label">
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
    <span v-if="unread" class="badge">{{ unread > 9 ? "9+" : unread }}</span>
  </RouterLink>
</template>

<style scoped>
.bell {
  position: relative;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: var(--ink);
}
.bell svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.badge {
  position: absolute;
  top: 2px;
  right: 1px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  border: 2px solid var(--paper);
  background: var(--team-a);
  color: #fff;
  font-size: 0.66rem;
  font-weight: 800;
  line-height: 14px;
  text-align: center;
}
</style>
