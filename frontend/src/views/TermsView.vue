<template>
  <main class="page legal">
    <h1>Termini d'uso</h1>
    <p class="muted">Ultimo aggiornamento: 15 ottobre 2026</p>

    <p>
      Maraffometro è un servizio gratuito e amatoriale per registrare partite di Maraffa e tenerne la classifica.
      Usandolo accetti queste poche regole.
    </p>

    <h2>Gioca pulito</h2>
    <ul>
      <li>Registra solo partite giocate davvero, con i punti giusti.</li>
      <li>Non usare nomi, motti o profili ospite offensivi o che imitano qualcun altro.</li>
      <li>
        Chi ha giocato una partita può annullarla se è sbagliata; l'amministratore può annullare partite false e
        rimuovere contenuti o account che non rispettano queste regole.
      </li>
    </ul>

    <h2>Nessuna garanzia</h2>
    <p>
      Il servizio è offerto così com'è, senza garanzie di disponibilità o di conservazione dei dati, e può cambiare o
      chiudere in qualsiasi momento. La classifica è un gioco: non ha valore oltre la pausa pranzo.
    </p>

    <h2>Il codice</h2>
    <p>
      Il codice sorgente è pubblicato con licenza
      <a href="https://github.com/Fre0Grella/maraffometro" target="_blank" rel="noopener">AGPL-3.0</a>.
    </p>

    <h2>Privacy</h2>
    <p>Come trattiamo i dati è spiegato nell'<RouterLink to="/privacy">informativa privacy</RouterLink>.</p>
  </main>
</template>

<style scoped>
.legal {
  line-height: 1.6;
}
h1 {
  font-size: 2rem;
  margin: 8px 0 4px;
}
h2 {
  font-size: 1.2rem;
  margin: 26px 0 8px;
}
ul {
  padding-left: 20px;
}
li + li {
  margin-top: 8px;
}
</style>
