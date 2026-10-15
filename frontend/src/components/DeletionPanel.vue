<!--
  Deleting a match is a vote among its registered players: propose (with a
  confirmation), then each voter says yes or no; a strict majority of yes
  deletes it. Admins keep a direct delete for fake matches.
-->
<script setup lang="ts">
import { computed, ref } from "vue";
import type { MatchDetailDTO, Vote } from "@maraffometro/shared";
import { useProposeDeletion, useVoidMatch, useVoteDeletion } from "@/api/queries";
import BottomSheet from "./BottomSheet.vue";

const props = defineProps<{ match: MatchDetailDTO }>();

const propose = useProposeDeletion();
const vote = useVoteDeletion();
const adminVoid = useVoidMatch();
const confirmPropose = ref(false);
const confirmAdmin = ref(false);

const proposal = computed(() => props.match.deletion);
const open = computed(() => proposal.value?.status === "open");
/** Who would vote: the registered players at the table. */
const voters = computed(() => props.match.seats.filter((p) => !p.isGuest && !p.deleted).length);
const needed = computed(() => Math.floor(voters.value / 2) + 1);
const error = computed(() => propose.error.value ?? vote.error.value ?? adminVoid.error.value);

async function sendProposal() {
  await propose.mutateAsync(props.match.id);
  confirmPropose.value = false;
}

function cast(v: Vote) {
  vote.mutate({ matchId: props.match.id, vote: v });
}

async function deleteNow() {
  await adminVoid.mutateAsync(props.match.id);
  confirmAdmin.value = false;
}
</script>

<template>
  <section v-if="open && proposal" class="vote card">
    <p class="title">
      <strong>{{ proposal.proposedBy.name }}</strong> propone di eliminare questa partita.
    </p>
    <div class="tally" role="img" :aria-label="`${proposal.yes} sì e ${proposal.no} no, servono ${proposal.needed} sì`">
      <span class="bar">
        <span class="yes" :style="{ width: `${(proposal.yes / proposal.eligible) * 100}%` }" />
        <span class="no" :style="{ width: `${(proposal.no / proposal.eligible) * 100}%` }" />
        <span class="goal" :style="{ left: `${(proposal.needed / proposal.eligible) * 100}%` }" />
      </span>
      <span class="counts">
        <span class="ok">Sì {{ proposal.yes }}</span> · <span class="ko">No {{ proposal.no }}</span>
        <span class="muted"> · servono {{ proposal.needed }} sì su {{ proposal.eligible }}</span>
      </span>
    </div>
    <template v-if="proposal.canVote">
      <div class="choices">
        <button class="btn small" :class="{ chosen: proposal.myVote === 'yes' }" :disabled="vote.isPending.value" @click="cast('yes')">
          Sì, eliminala
        </button>
        <button class="btn small ghost" :class="{ chosen: proposal.myVote === 'no' }" :disabled="vote.isPending.value" @click="cast('no')">
          No, tienila
        </button>
      </div>
      <p v-if="proposal.myVote" class="muted note">
        Hai votato {{ proposal.myVote === "yes" ? "sì" : "no" }}. Puoi cambiare idea finché la votazione è aperta.
      </p>
    </template>
    <p v-else class="muted note">Votano i giocatori registrati di questa partita.</p>
  </section>

  <p v-else-if="proposal?.status === 'rejected' && !match.voided" class="muted note">
    Una proposta di eliminarla è stata respinta.
  </p>

  <div class="actions">
    <button v-if="match.canProposeDeletion" class="btn danger small" @click="confirmPropose = true">
      Proponi di eliminare la partita
    </button>
    <button v-if="match.canAdminVoid" class="link muted" @click="confirmAdmin = true">Elimina subito (admin)</button>
  </div>
  <p v-if="error" class="error">{{ error.message }}</p>

  <BottomSheet :open="confirmPropose" title="Proporre di eliminarla?" @close="confirmPropose = false">
    <div class="sheet">
      <p>
        I giocatori registrati di questa partita riceveranno una notifica. Viene eliminata solo se la maggioranza vota
        sì: servono <strong>{{ needed }} sì su {{ voters }}</strong>, e il tuo conta già.
      </p>
      <p class="muted">
        Se viene eliminata esce da classifica e statistiche. Le variazioni di punteggio delle partite giocate dopo
        restano come sono.
      </p>
      <button class="btn danger block" :disabled="propose.isPending.value" @click="sendProposal">Invia la proposta</button>
      <button class="btn ghost block" @click="confirmPropose = false">Annulla</button>
    </div>
  </BottomSheet>

  <BottomSheet :open="confirmAdmin" title="Eliminare subito?" @close="confirmAdmin = false">
    <div class="sheet">
      <p>Come amministratore puoi eliminarla senza votazione. Da usare solo per partite finte.</p>
      <button class="btn danger block" :disabled="adminVoid.isPending.value" @click="deleteNow">Elimina</button>
      <button class="btn ghost block" @click="confirmAdmin = false">Annulla</button>
    </div>
  </BottomSheet>
</template>

<style scoped>
.vote {
  display: grid;
  gap: 10px;
  margin-top: 18px;
  padding: 14px 16px;
  border-color: var(--team-a);
}
.title {
  margin: 0;
}
.tally {
  display: grid;
  gap: 6px;
}
.bar {
  position: relative;
  display: flex;
  height: 10px;
  border-radius: 999px;
  background: var(--paper-2);
  overflow: hidden;
}
.yes {
  background: var(--danger);
}
.no {
  margin-left: auto;
  background: var(--ok);
}
.goal {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: var(--ink);
}
.counts {
  font-size: 0.9rem;
  font-weight: 600;
}
.ok {
  color: var(--danger);
}
.ko {
  color: var(--ok);
}
.choices {
  display: flex;
  gap: 8px;
}
.chosen {
  box-shadow: 0 0 0 3px var(--gold);
}
.note {
  margin: 0;
  font-size: 0.85rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 16px;
}
.link {
  border: 0;
  background: none;
  padding: 0;
  font-size: 0.85rem;
  text-decoration: underline;
  cursor: pointer;
}
.sheet {
  display: grid;
  gap: 10px;
}
.sheet p {
  margin: 0;
}
</style>
