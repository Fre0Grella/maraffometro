<script setup lang="ts">
import { computed, ref } from "vue";
import { installEvent, isIos, promptInstall, standalone } from "@/composables/pwa";

const DISMISS_KEY = "maraffometro.install-dismissed";

function wasDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

const dismissed = ref(wasDismissed());
const visible = computed(() => !standalone.value && !dismissed.value && (installEvent.value !== null || isIos));

function dismiss() {
  dismissed.value = true;
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    // Shown again next time, no harm done.
  }
}
</script>

<template>
  <section v-if="visible" class="install card">
    <img src="/pwa-192.png" alt="" width="44" height="44" />
    <div class="text">
      <strong>Installa l'app</strong>
      <p v-if="installEvent" class="muted">Funziona anche senza rete: segni la partita e la invia quando torni online.</p>
      <p v-else class="muted">
        Tocca <span class="share" aria-label="Condividi">⎋</span> Condividi e poi
        <strong>Aggiungi alla schermata Home</strong>. Funziona anche senza rete.
      </p>
    </div>
    <div class="actions">
      <button v-if="installEvent" class="btn small" @click="promptInstall">Installa</button>
      <button class="close" aria-label="Non ora" @click="dismiss">✕</button>
    </div>
  </section>
</template>

<style scoped>
.install {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 16px;
}
img {
  flex: none;
  border-radius: 11px;
}
.text {
  flex: 1;
  min-width: 0;
}
.text p {
  margin: 2px 0 0;
  font-size: 0.85rem;
  line-height: 1.35;
}
.share {
  display: inline-block;
  transform: rotate(-90deg);
}
.actions {
  display: flex;
  align-items: center;
  gap: 6px;
}
.close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: transparent;
  cursor: pointer;
}
</style>
