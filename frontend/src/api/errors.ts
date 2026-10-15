/**
 * What the player reads for each error code the API sends (see
 * backend/src/routes/errors.ts). The UI is in Italian; the code is not.
 */
const MESSAGES: Record<string, string> = {
  network_error: "Nessuna connessione",
  unauthenticated: "Devi accedere",
  invalid_request: "Dati non validi",
  invalid_match: "La partita registrata non è valida",
  duplicate_players: "Servono quattro giocatori diversi",
  unknown_player: "Uno dei giocatori non esiste più",
  future_date: "La data della partita è nel futuro",
  not_seated: "Puoi registrare solo le partite in cui hai giocato",
  void_forbidden: "Solo chi ha giocato o registrato la partita può annullarla",
  claim_code_forbidden: "Solo chi ha creato l'ospite o ci ha giocato può generare il codice",
  player_not_found: "Giocatore non trovato",
  match_not_found: "Partita non trovata",
  not_a_guest: "Non è un profilo ospite",
  claim_code_invalid: "Codice non valido o scaduto",
  match_exists: "Questa partita è già stata registrata da qualcun altro",
  claim_overlap: "Hai giocato nella stessa partita di questo ospite: non può essere te",
  google_not_configured: "L'accesso con Google non è ancora configurato",
  server_error: "Errore del server, riprova",
};

export function errorMessage(code: string): string {
  return MESSAGES[code] ?? "Qualcosa è andato storto";
}

/** Shown in place of a deleted account's name. */
export const DELETED_PLAYER_NAME = "Ex giocatore";
