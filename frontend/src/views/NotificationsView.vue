<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import type { NotificationDTO } from "@maraffometro/shared";
import { useMarkNotificationsRead, useNotifications } from "@/api/queries";
import PlayerAvatar from "@/components/PlayerAvatar.vue";

const router = useRouter();
const { data, isLoading, error } = useNotifications(true);
const markRead = useMarkNotificationsRead();
const items = computed(() => data.value?.items ?? []);

const day = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "adesso";
  if (minutes < 60) return `${minutes} min fa`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h fa`;
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function text(n: NotificationDTO): string {
  const match = n.match ? `la partita di ${day(n.match.playedAt)}` : "una partita";
  switch (n.type) {
    case "deletion_proposed":
      return `${n.actor?.name ?? "Qualcuno"} propone di eliminare ${match}. Tocca per votare.`;
    case "match_deleted":
      return `La maggioranza ha votato sì: ${match} è stata eliminata.`;
    case "deletion_rejected":
      return `La proposta di eliminare ${match} è stata respinta.`;
  }
}

function open(n: NotificationDTO) {
  if (!n.read) markRead.mutate([n.id]);
  if (n.match) router.push(`/matches/${n.match.id}`);
}
</script>

<template>
  <main class="page">
    <div class="head">
      <h1>Notifiche</h1>
      <button
        v-if="data?.unread"
        class="btn small ghost"
        :disabled="markRead.isPending.value"
        @click="markRead.mutate(undefined)"
      >
        Segna tutte come lette
      </button>
    </div>

    <p v-if="isLoading" class="muted">Carico…</p>
    <p v-else-if="error" class="error">{{ error.message }}</p>
    <section v-else-if="!items.length" class="empty card">
      <p class="muted">Nessuna notifica. Qui arrivano le proposte di eliminare una partita in cui hai giocato.</p>
    </section>

    <ul v-else class="list">
      <li v-for="n in items" :key="n.id">
        <button class="item card" :class="{ unread: !n.read }" @click="open(n)">
          <PlayerAvatar v-if="n.actor" :player="n.actor" :size="36" />
          <span v-else class="icon" aria-hidden="true">{{ n.type === "match_deleted" ? "🗑️" : "✋" }}</span>
          <span class="body">
            <span class="text">{{ text(n) }}</span>
            <span class="when muted">{{ ago(n.createdAt) }}</span>
          </span>
          <span v-if="!n.read" class="dot" aria-label="da leggere" />
        </button>
      </li>
    </ul>
  </main>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 8px 0 16px;
}
h1 {
  font-size: 2rem;
}
.empty {
  padding: 18px;
}
.empty p {
  margin: 0;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}
.item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  text-align: left;
  cursor: pointer;
}
.item.unread {
  border-color: var(--team-a);
  background: color-mix(in srgb, var(--team-a-soft) 45%, var(--card));
}
.icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--paper-2);
  font-size: 1.1rem;
}
.body {
  display: grid;
  gap: 2px;
  min-width: 0;
}
.text {
  font-weight: 600;
  line-height: 1.35;
}
.when {
  font-size: 0.8rem;
}
.dot {
  flex: none;
  width: 10px;
  height: 10px;
  margin-left: auto;
  border-radius: 50%;
  background: var(--team-a);
}
</style>
