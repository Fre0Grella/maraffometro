<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useRouter } from "vue-router";
import { useClaim, useDeleteAccount, useLogout, useMe, useUpdateProfile } from "@/api/queries";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import AppFooter from "@/components/AppFooter.vue";

const router = useRouter();
const { data: me } = useMe();
const update = useUpdateProfile();
const claim = useClaim();
const logout = useLogout();
const deleteAccount = useDeleteAccount();
const confirmingDelete = ref(false);

const form = ref({ name: "", emoji: "", color: "", motto: "" });
const saved = ref(false);
watchEffect(() => {
  if (me.value && !form.value.name) {
    form.value = { name: me.value.name, emoji: me.value.emoji, color: me.value.color, motto: me.value.motto };
  }
});

const EMOJIS = ["🃏", "🂡", "🍷", "🐓", "🦊", "🐗", "🌶️", "🍝", "🎩", "⚡", "🔥", "🌊", "🦉", "🐺", "🍀", "👑", "🎯", "🧠", "🥖", "☕", "🍺", "🕷️"];
const COLORS = ["#b4442c", "#2f6b4f", "#c08a1e", "#3d5a99", "#7a3e6e", "#4f7c8a", "#8a5a2b", "#2a1f17"];

const preview = computed(() => ({ ...form.value, name: form.value.name || "?" }));
const code = ref("");

async function save() {
  saved.value = false;
  await update.mutateAsync(form.value);
  saved.value = true;
}

async function doClaim() {
  await claim.mutateAsync(code.value.trim());
  code.value = "";
}

async function doDelete() {
  await deleteAccount.mutateAsync();
  router.replace("/");
}

async function doLogout() {
  await logout.mutateAsync();
  router.replace("/");
}
</script>

<template>
  <main v-if="me" class="page">
    <h1>Il tuo profilo</h1>

    <div class="preview card">
      <PlayerAvatar :player="preview" :size="64" />
      <div>
        <strong>{{ preview.name }}</strong>
        <p v-if="form.motto" class="muted">“{{ form.motto }}”</p>
      </div>
      <RouterLink :to="`/players/${me.id}`" class="stats-link" aria-label="Le tue statistiche" title="Le tue statistiche">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <path d="M4 20V11M10 20V5M16 20v-6M22 20H2" />
          <path d="m4 8 6-4 6 6 5-4" />
        </svg>
      </RouterLink>
    </div>

    <form class="form" @submit.prevent="save">
      <label class="field">
        Nome al tavolo
        <input v-model="form.name" maxlength="30" required />
      </label>

      <fieldset>
        <legend>Simbolo</legend>
        <div class="emojis">
          <button
            v-for="e in EMOJIS"
            :key="e"
            type="button"
            :class="{ on: form.emoji === e }"
            :aria-pressed="form.emoji === e"
            @click="form.emoji = e"
          >
            {{ e }}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Colore</legend>
        <div class="colors">
          <button
            v-for="c in COLORS"
            :key="c"
            type="button"
            :style="{ background: c }"
            :class="{ on: form.color === c }"
            :aria-label="`Colore ${c}`"
            :aria-pressed="form.color === c"
            @click="form.color = c"
          />
        </div>
      </fieldset>

      <label class="field">
        Motto <small class="muted">(facoltativo)</small>
        <input v-model="form.motto" maxlength="80" placeholder="Busso, striscio, volo." />
      </label>

      <button class="btn block" :disabled="update.isPending.value">Salva</button>
      <p v-if="saved && !update.isPending.value" class="ok">Salvato.</p>
      <p v-if="update.error.value" class="error">{{ update.error.value.message }}</p>
    </form>

    <h2 class="section-title">Reclama un profilo ospite</h2>
    <form class="claim card" @submit.prevent="doClaim">
      <p class="muted">
        Se qualcuno ti ha registrato come ospite prima che entrassi, fatti dare il codice dal suo profilo: le partite
        passano a te.
      </p>
      <div class="row">
        <input v-model="code" class="code num" maxlength="6" placeholder="ABC123" autocapitalize="characters" aria-label="Codice" />
        <button class="btn" :disabled="code.trim().length !== 6 || claim.isPending.value">Reclama</button>
      </div>
      <p v-if="claim.data.value" class="ok">Fatto: le partite di {{ claim.data.value.claimed.name }} ora sono tue.</p>
      <p v-if="claim.error.value" class="error">{{ claim.error.value.message }}</p>
    </form>

    <button class="btn ghost block logout" @click="doLogout">Esci</button>

    <section class="danger-zone">
      <button v-if="!confirmingDelete" class="btn danger small" @click="confirmingDelete = true">
        Elimina il mio account
      </button>
      <div v-else class="card confirm">
        <p>
          Nome, email, foto e motto vengono cancellati. Nelle partite già giocate resterai come "Ex giocatore", senza
          classifica. Non si torna indietro.
        </p>
        <div class="row">
          <button class="btn danger small" :disabled="deleteAccount.isPending.value" @click="doDelete">
            Elimina definitivamente
          </button>
          <button class="btn ghost small" @click="confirmingDelete = false">Annulla</button>
        </div>
        <p v-if="deleteAccount.error.value" class="error">{{ deleteAccount.error.value.message }}</p>
      </div>
    </section>

    <AppFooter />
  </main>
</template>

<style scoped>
h1 {
  font-size: 2rem;
  margin: 8px 0 16px;
}
.preview {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
}
.preview p {
  margin: 2px 0 0;
  font-style: italic;
}
.stats-link {
  display: grid;
  place-items: center;
  flex: none;
  width: 44px;
  height: 44px;
  margin-left: auto;
  border-radius: 50%;
  border: 1.5px solid var(--line);
  color: var(--ink);
}
.stats-link svg {
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.form {
  display: grid;
  gap: 16px;
  margin-top: 18px;
}
fieldset {
  border: 0;
  margin: 0;
  padding: 0;
}
legend {
  font-weight: 600;
  font-size: 0.9rem;
  margin-bottom: 6px;
}
.emojis {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
  gap: 6px;
}
.emojis button {
  height: 44px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--line);
  background: var(--card);
  font-size: 1.3rem;
  cursor: pointer;
}
.emojis .on {
  border-color: var(--ink);
  box-shadow: inset 0 0 0 1px var(--ink);
}
.colors {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.colors button {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 3px solid var(--paper);
  box-shadow: 0 0 0 1.5px var(--line);
  cursor: pointer;
}
.colors .on {
  box-shadow: 0 0 0 2.5px var(--ink);
}
.ok {
  color: var(--ok);
  font-weight: 600;
  margin: 0;
}
.claim {
  padding: 14px;
}
.claim p {
  margin: 0 0 10px;
}
.row {
  display: flex;
  gap: 8px;
}
.code {
  flex: 1;
  min-width: 0;
  min-height: 48px;
  padding: 0 12px;
  border-radius: var(--radius-sm);
  border: 1.5px solid var(--line);
  background: var(--card);
  font-size: 1.3rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
.logout {
  margin-top: 28px;
}
.danger-zone {
  margin-top: 36px;
  padding-top: 18px;
  border-top: 1px solid var(--line);
  display: grid;
  gap: 12px;
  justify-items: start;
}
.confirm {
  padding: 14px;
}
.confirm p {
  margin: 0 0 10px;
}

</style>
