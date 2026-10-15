<template>
  <main class="page legal">
    <h1>Privacy</h1>
    <p class="muted">Ultimo aggiornamento: 15 ottobre 2026</p>

    <p>
      Maraffometro è un progetto amatoriale e open source per tenere la classifica della Maraffa tra amici. Raccoglie
      il minimo indispensabile per funzionare e non lo usa per nient'altro.
    </p>

    <h2>Cosa raccogliamo</h2>
    <ul>
      <li>
        <strong>Dal tuo account Google</strong>, quando accedi: un identificativo dell'account, l'indirizzo email, il
        nome e l'indirizzo della foto profilo. Servono a riconoscerti agli accessi successivi; l'email non viene mai
        mostrata ad altri.
      </li>
      <li>
        <strong>Il profilo che personalizzi</strong>: nome al tavolo, simbolo, colore e motto. Sono pubblici, come la
        classifica.
      </li>
      <li>
        <strong>Le partite</strong>: chi ha giocato, i punti di ogni mano, le maraffe, chi ha registrato la partita.
        Da queste derivano punteggio e statistiche, visibili a chiunque apra il sito.
      </li>
      <li>
        <strong>Profili ospite</strong>: chi registra una partita può aggiungere un amico non ancora iscritto con un
        nome a scelta. L'amico può reclamare il profilo, o chiederne la rimozione.
      </li>
    </ul>

    <h2>Cosa non facciamo</h2>
    <p>
      Niente pubblicità, niente analytics, niente profilazione, nessuna vendita o cessione di dati. Non chiediamo a
      Google altro che nome, email e foto.
    </p>

    <h2>Cookie e memoria del telefono</h2>
    <p>
      Un solo cookie tecnico, <code>session_token</code>, tiene aperto l'accesso per 30 giorni. Nel browser restano la
      partita in corso e quelle in attesa di invio, così non si perdono se la connessione cade. Non ci sono cookie di
      terze parti.
    </p>

    <h2>Dove stanno i dati</h2>
    <p>
      Sito e database sono ospitati su Cloudflare (Pages, Workers, D1), con il database in Europa occidentale.
      Cloudflare tratta i dati per nostro conto e può conservare per breve tempo i registri tecnici delle richieste.
      L'accesso passa da Google, secondo la sua informativa.
    </p>

    <h2>I tuoi diritti</h2>
    <p>
      Puoi modificare il profilo quando vuoi ed <strong>eliminare l'account</strong> da
      <RouterLink to="/profilo">Profilo</RouterLink>: nome, email, foto e motto vengono cancellati e il tuo posto nelle
      partite già giocate diventa anonimo ("Ex giocatore"), perché quelle partite fanno parte della storia degli altri
      giocatori. Per qualsiasi altra richiesta (accesso, rettifica, rimozione di un profilo ospite) apri una
      segnalazione su
      <a href="https://github.com/Fre0Grella/maraffometro/issues" target="_blank" rel="noopener">GitHub</a>.
    </p>

    <p class="muted">Il codice è pubblico: puoi verificare tutto quanto scritto qui.</p>
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
code {
  font-size: 0.9em;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--paper-2);
}
</style>
