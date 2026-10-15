<script setup lang="ts">
defineProps<{ form: ("W" | "L" | "D")[] }>();
const label = { W: "vinta", L: "persa", D: "pari" } as const;
</script>

<template>
  <span class="form" :aria-label="`Ultime partite: ${form.map((f) => label[f]).join(', ')}`">
    <span v-for="(f, i) in form" :key="i" class="dot" :class="f">{{ f === "W" ? "V" : f === "L" ? "P" : "=" }}</span>
  </span>
</template>

<style scoped>
.form {
  display: inline-flex;
  gap: 4px;
}
.dot {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 800;
  color: #fff;
}
.W {
  background: var(--ok);
}
.L {
  background: var(--danger);
}
.D {
  background: var(--ink-2);
}
</style>
