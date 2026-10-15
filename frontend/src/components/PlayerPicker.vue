<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { PlayerDTO } from "@maraffometro/shared";
import { useCreateGuest, usePlayers } from "@/api/queries";
import BottomSheet from "./BottomSheet.vue";
import PlayerChip from "./PlayerChip.vue";

const props = defineProps<{ open: boolean; exclude: string[]; title: string }>();
const emit = defineEmits<{ close: []; pick: [player: PlayerDTO] }>();

const { data: players, isLoading } = usePlayers();
const createGuest = useCreateGuest();
const search = ref("");

watch(
  () => props.open,
  (o) => {
    if (o) search.value = "";
  },
);

const visible = computed(() => {
  const q = search.value.trim().toLowerCase();
  return (players.value ?? []).filter((p) => !props.exclude.includes(p.id) && (!q || p.name.toLowerCase().includes(q)));
});
const canAddGuest = computed(() => {
  const q = search.value.trim().toLowerCase();
  return q.length > 0 && !(players.value ?? []).some((p) => p.name.toLowerCase() === q);
});

async function addGuest() {
  const p = await createGuest.mutateAsync(search.value.trim());
  emit("pick", p);
}
</script>

<template>
  <BottomSheet :open="open" :title="title" @close="emit('close')">
    <label class="field">
      <span class="sr">Cerca</span>
      <input v-model="search" type="search" placeholder="Cerca o scrivi un nome nuovo…" autocomplete="off" />
    </label>
    <button v-if="canAddGuest" class="add" :disabled="createGuest.isPending.value" @click="addGuest">
      <span class="plus">+</span>
      <span>
        Aggiungi <strong>{{ search.trim() }}</strong> come ospite
        <small class="muted">potrà reclamare il profilo quando accede</small>
      </span>
    </button>
    <p v-if="createGuest.error.value" class="error">{{ createGuest.error.value.message }}</p>
    <p v-if="isLoading" class="muted">Carico i giocatori…</p>
    <ul class="list">
      <li v-for="p in visible" :key="p.id">
        <button @click="emit('pick', p)"><PlayerChip :player="p" :size="34" /></button>
      </li>
    </ul>
    <p v-if="!isLoading && !visible.length && !canAddGuest" class="muted">Nessun giocatore disponibile.</p>
  </BottomSheet>
</template>

<style scoped>
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.add {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  margin-top: 10px;
  padding: 12px;
  text-align: left;
  border: 1.5px dashed var(--ink-2);
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
}
.add small {
  display: block;
  font-size: 0.8rem;
}
.plus {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--ink);
  color: var(--paper);
  font-weight: 800;
}
.list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  gap: 4px;
}
.list button {
  display: flex;
  width: 100%;
  min-height: 52px;
  padding: 8px 10px;
  border: 0;
  border-radius: var(--radius-sm);
  background: var(--card);
  cursor: pointer;
  text-align: left;
}
</style>
