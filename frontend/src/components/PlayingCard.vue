<!--
  A playing card in one of the four Italian suits, with as many pips as its
  rank. The suit drawings are SVG symbols defined once in index.html.
-->
<script setup lang="ts">
import { computed } from "vue";

export type Suit = "denari" | "coppe" | "spade" | "bastoni";
export type Rank = "A" | "2" | "3";

const props = defineProps<{ rank: Rank; suit: Suit }>();

/** Pip boxes on an 82×120 card: one big ace pip, then two, then three. */
const PIPS: Record<Rank, { x: number; y: number; size: number }[]> = {
  A: [{ x: 17, y: 36, size: 48 }],
  "2": [
    { x: 24, y: 20, size: 34 },
    { x: 24, y: 66, size: 34 },
  ],
  "3": [
    { x: 26, y: 11, size: 30 },
    { x: 26, y: 45, size: 30 },
    { x: 26, y: 79, size: 30 },
  ],
};

const COLORS: Record<Suit, string> = {
  denari: "#a8751a",
  coppe: "#b4442c",
  spade: "#3d5a99",
  bastoni: "#8a5a24",
};

const pips = computed(() => PIPS[props.rank]);
const label = computed(() => `${props.rank === "A" ? "Asso" : props.rank} di ${props.suit}`);
</script>

<template>
  <span class="playing-card" :style="{ '--c': COLORS[suit] }" role="img" :aria-label="label">
    <b>{{ rank }}</b>
    <svg viewBox="0 0 82 120" aria-hidden="true">
      <use v-for="(p, i) in pips" :key="i" :href="`#s-${suit}`" :x="p.x" :y="p.y" :width="p.size" :height="p.size" />
    </svg>
    <b class="flip">{{ rank }}</b>
  </span>
</template>

<style scoped>
.playing-card {
  position: relative;
  display: block;
  width: 82px;
  height: 120px;
  border-radius: 11px;
  background: #fffaf1;
  border: 2.5px solid #2a1f17;
  box-shadow: var(--shadow);
}
svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
b {
  position: absolute;
  top: 7px;
  left: 9px;
  font-family: var(--display);
  font-size: 22px;
  font-weight: 800;
  line-height: 1;
  color: var(--c);
}
b.flip {
  top: auto;
  left: auto;
  right: 9px;
  bottom: 7px;
  transform: rotate(180deg);
}
</style>
