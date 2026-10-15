<script setup lang="ts">
import { useMatches } from "@/api/queries";
import MatchCard from "@/components/MatchCard.vue";

const { data: matches, isLoading, error } = useMatches(undefined, 50);
</script>

<template>
  <main class="page">
    <h1>Partite</h1>
    <p v-if="isLoading" class="muted">Carico…</p>
    <p v-else-if="error" class="error">{{ error.message }}</p>
    <p v-else-if="!matches?.length" class="muted">Ancora nessuna partita.</p>
    <div v-else class="list">
      <MatchCard v-for="m in matches" :key="m.id" :match="m" />
    </div>
  </main>
</template>

<style scoped>
h1 {
  font-size: 2rem;
  margin: 8px 0 16px;
}
.list {
  display: grid;
  gap: 10px;
}
</style>
