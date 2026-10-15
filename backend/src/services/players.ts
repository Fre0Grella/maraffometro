import type { MeDTO, PlayerDTO } from "@maraffometro/shared";

export interface PlayerRow {
  id: string;
  google_sub: string | null;
  email: string | null;
  picture_url: string | null;
  name: string;
  emoji: string;
  color: string;
  motto: string;
  created_by: string | null;
  claim_code: string | null;
  claim_code_expires_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

export function toPlayerDTO(row: PlayerRow): PlayerDTO {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    color: row.color,
    motto: row.motto,
    isGuest: row.google_sub === null && row.deleted_at === null,
    deleted: row.deleted_at !== null,
  };
}

export function toMeDTO(row: PlayerRow): MeDTO {
  return { ...toPlayerDTO(row), email: row.email, pictureUrl: row.picture_url };
}

export async function getPlayer(db: D1Database, id: string): Promise<PlayerRow | null> {
  return db.prepare("SELECT * FROM players WHERE id = ?").bind(id).first<PlayerRow>();
}

export async function playersById(db: D1Database, ids: Iterable<string>): Promise<Map<string, PlayerRow>> {
  const unique = [...new Set(ids)];
  const map = new Map<string, PlayerRow>();
  // D1 caps bound parameters per statement; chunk to stay well under it.
  for (let i = 0; i < unique.length; i += 90) {
    const chunk = unique.slice(i, i + 90);
    const { results } = await db
      .prepare(`SELECT * FROM players WHERE id IN (${chunk.map(() => "?").join(",")})`)
      .bind(...chunk)
      .all<PlayerRow>();
    for (const r of results) map.set(r.id, r);
  }
  return map;
}

const EMOJIS = ["🃏", "🂡", "🍷", "🐓", "🦊", "🐗", "🌶️", "🍝", "🎩", "⚡", "🔥", "🌊"];
const COLORS = ["#b4442c", "#2f6b4f", "#c08a1e", "#3d5a99", "#7a3e6e", "#4f7c8a"];

/** A first look for a new profile, so the leaderboard isn't a wall of identical cards. */
export function defaultLook(seed: string): { emoji: string; color: string } {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { emoji: EMOJIS[h % EMOJIS.length]!, color: COLORS[(h >>> 4) % COLORS.length]! };
}

/**
 * Finds the player behind a Google account, creating them on first sign-in.
 * The display name starts as the Google first name; the player can change it.
 */
export async function upsertGoogleUser(
  db: D1Database,
  user: { sub: string; email: string | null; name: string; picture: string | null },
): Promise<PlayerRow> {
  const existing = await db.prepare("SELECT * FROM players WHERE google_sub = ?").bind(user.sub).first<PlayerRow>();
  if (existing) {
    await db
      .prepare("UPDATE players SET email = ?, picture_url = ? WHERE id = ?")
      .bind(user.email, user.picture, existing.id)
      .run();
    return { ...existing, email: user.email, picture_url: user.picture };
  }
  const id = crypto.randomUUID();
  const look = defaultLook(id);
  const name = (user.name || user.email?.split("@")[0] || "Player").slice(0, 30);
  await db
    .prepare(
      "INSERT INTO players (id, google_sub, email, picture_url, name, emoji, color) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, user.sub, user.email, user.picture, name, look.emoji, look.color)
    .run();
  return (await getPlayer(db, id))!;
}

const CLAIM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const CLAIM_CODE_DAYS = 7;

export function newClaimCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes].map((b) => CLAIM_ALPHABET[b % CLAIM_ALPHABET.length]).join("");
}

/**
 * Folds a guest's history into the signed-in player who claims it, then
 * removes the guest. Refused if both sat in the same match, which would leave
 * one player in two seats.
 */
/**
 * Erases a player's personal data at their request. The row stays, renamed
 * and unlinked from Google, because the matches the others played with them
 * still count; signing in again with Google starts a brand-new profile.
 */
export async function deleteAccount(db: D1Database, playerId: string): Promise<void> {
  await db
    .prepare(
      `UPDATE players SET google_sub = NULL, email = NULL, picture_url = NULL, name = 'Deleted player',
              emoji = '👤', color = '#8a8178', motto = '', claim_code = NULL, claim_code_expires_at = NULL,
              deleted_at = ?
        WHERE id = ?`,
    )
    .bind(new Date().toISOString(), playerId)
    .run();
}

export async function mergeGuestInto(db: D1Database, guestId: string, playerId: string): Promise<"ok" | "overlap"> {
  const overlap = await db
    .prepare(
      `SELECT 1 FROM match_players a JOIN match_players b ON a.match_id = b.match_id
       WHERE a.player_id = ? AND b.player_id = ? LIMIT 1`,
    )
    .bind(guestId, playerId)
    .first();
  if (overlap) return "overlap";

  await db.batch([
    db.prepare("UPDATE match_players SET player_id = ? WHERE player_id = ?").bind(playerId, guestId),
    db.prepare("UPDATE matches SET recorded_by = ? WHERE recorded_by = ?").bind(playerId, guestId),
    db.prepare("UPDATE matches SET voided_by = ? WHERE voided_by = ?").bind(playerId, guestId),
    db.prepare("UPDATE players SET created_by = ? WHERE created_by = ?").bind(playerId, guestId),
    db.prepare("UPDATE rating_changes SET player_id = ? WHERE player_id = ?").bind(playerId, guestId),
    db.prepare("DELETE FROM ratings WHERE player_id = ?").bind(guestId),
    db.prepare("DELETE FROM players WHERE id = ?").bind(guestId),
  ]);
  return "ok";
}
