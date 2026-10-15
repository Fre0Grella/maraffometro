<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useMe } from "@/api/queries";

const route = useRoute();
const router = useRouter();
const { data: me } = useMe();
watchEffect(() => {
  if (me.value) router.replace("/");
});
const failed = computed(() => route.query.error !== undefined);
/** The demo sign-in only exists on a local Worker; the button only exists in a dev build. */
const devLogin = import.meta.env.DEV;
const devName = ref("Marco");
</script>

<template>
  <main class="page login">
    <div class="hero">
      <div class="cards" aria-hidden="true">
        <span class="c c1">A</span>
        <span class="c c2">2</span>
        <span class="c c3">3</span>
      </div>
      <h1>Maraffometro</h1>
      <p class="muted">La classifica della Maraffa in pausa pranzo. Chi bussa, chi striscia, chi vince davvero.</p>
    </div>

    <p v-if="failed" class="error">Accesso non riuscito, riprova.</p>

    <a class="btn block google" href="/auth/google">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.7 2.3 2.4 6.6 2.4 12s4.3 9.7 9.6 9.7c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z" />
      </svg>
      Entra con Google
    </a>

    <form v-if="devLogin" class="dev card" @submit.prevent>
      <label class="field">
        Entra in locale come
        <input v-model="devName" maxlength="30" />
      </label>
      <a class="btn ghost block" :href="`/auth/dev?name=${encodeURIComponent(devName)}`">Accesso demo</a>
      <small class="muted">Solo in sviluppo. Usa nomi diversi in finestre anonime per simulare più giocatori.</small>
    </form>

    <p class="legal muted">
      Accedendo accetti i <RouterLink to="/terms">termini d'uso</RouterLink> e l'<RouterLink to="/privacy"
        >informativa privacy</RouterLink
      >.
    </p>
  </main>
</template>

<style scoped>
.login {
  display: grid;
  gap: 18px;
  padding-top: 40px;
}
.hero {
  text-align: center;
  display: grid;
  gap: 10px;
  justify-items: center;
  margin-bottom: 12px;
}
h1 {
  font-size: 2.6rem;
}
.hero p {
  max-width: 30ch;
  margin: 0;
}
.cards {
  position: relative;
  width: 180px;
  height: 110px;
  margin-bottom: 8px;
}
.c {
  position: absolute;
  top: 10px;
  left: 50%;
  display: grid;
  place-items: center;
  width: 62px;
  height: 90px;
  margin-left: -31px;
  border-radius: 9px;
  background: var(--card);
  border: 2px solid var(--ink);
  font-family: var(--display);
  font-size: 1.9rem;
  font-weight: 800;
  color: var(--team-a);
  box-shadow: var(--shadow);
}
.c1 {
  transform: translateX(-50px) rotate(-14deg);
}
.c2 {
  transform: translateY(-6px);
  color: var(--gold);
}
.c3 {
  transform: translateX(50px) rotate(14deg);
  color: var(--team-b);
}
.google {
  background: var(--card);
  color: var(--ink);
}
.legal {
  margin: 0;
  text-align: center;
  font-size: 0.85rem;
}
.dev {
  display: grid;
  gap: 10px;
  padding: 16px;
}
</style>
