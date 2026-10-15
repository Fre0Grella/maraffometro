import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Every refusal the API gives, as `{ error: code, message }`. The code is the
 * contract: the app turns it into the sentence the player reads, so the
 * message here is for logs and curl, not for people at the table.
 */
export const API_ERRORS = {
  unauthenticated: [401, "Sign in required"],
  invalid_request: [400, "Invalid request"],
  invalid_match: [400, "The match could not have been played"],
  duplicate_players: [400, "A match needs four different players"],
  unknown_player: [400, "Unknown player"],
  future_date: [400, "The match is dated in the future"],
  not_seated: [403, "Only a player seated at the table can record the match"],
  admin_only: [403, "Only an admin can delete a match outright"],
  not_a_voter: [403, "Only the registered players of this match can propose or vote on its deletion"],
  claim_code_forbidden: [403, "Only whoever added the guest, or played with them, can create a claim code"],
  player_not_found: [404, "Player not found"],
  match_not_found: [404, "Match not found"],
  not_a_guest: [404, "Not a guest profile"],
  claim_code_invalid: [404, "Invalid or expired claim code"],
  match_exists: [409, "A match with this id was recorded by someone else"],
  claim_overlap: [409, "You played in the same match as this guest, so it cannot be you"],
  proposal_open: [409, "A deletion proposal for this match is already open"],
  match_deleted: [409, "This match has already been deleted"],
  no_open_proposal: [404, "There is no open deletion proposal for this match"],
  google_not_configured: [500, "Google sign-in is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)"],
  server_error: [500, "Server error"],
} as const satisfies Record<string, readonly [ContentfulStatusCode, string]>;

export type ApiErrorCode = keyof typeof API_ERRORS;

/** Responds with the error's status and body; `detail` replaces the stock message. */
export function fail(c: Context, code: ApiErrorCode, detail?: string) {
  const [status, message] = API_ERRORS[code];
  return c.json({ error: code, message: detail ?? message }, status);
}
