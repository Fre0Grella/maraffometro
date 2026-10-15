import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { matchProblem, type ClaimCodeDTO, type MatchSubmitDTO } from "@maraffometro/shared";
import type { AppEnv } from "../env";
import { clearSession, requireAuth } from "./auth";
import {
  CLAIM_CODE_DAYS,
  defaultLook,
  deleteAccount,
  getPlayer,
  mergeGuestInto,
  newClaimCode,
  toMeDTO,
  toPlayerDTO,
  type PlayerRow,
} from "../services/players";
import { canVoid, getMatchDetail, getMatchRow, insertMatch, listMatches } from "../services/matches";
import { leaderboard, recomputeRatings } from "../services/ratings";
import { playerStats } from "../services/stats";

const api = new Hono<AppEnv>();

/** Whether the caller is one of the admins named in ADMIN_EMAILS. */
async function isAdmin(c: Context<AppEnv>): Promise<boolean> {
  if (!c.var.playerId || !c.env.ADMIN_EMAILS) return false;
  const me = await getPlayer(c.env.db, c.var.playerId);
  const admins = c.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase());
  return !!me?.email && admins.includes(me.email.toLowerCase());
}

/** Turns a zod failure into the same `{ error }` shape every other refusal has. */
const invalid = (
  result: { success: boolean; error?: { issues: readonly { message: string }[] } },
  c: { json: (b: unknown, s: 400) => Response },
) => {
  if (!result.success) return c.json({ error: result.error?.issues[0]?.message ?? "Richiesta non valida" }, 400);
};

// ── Session ────────────────────────────────────────────────────────────────

api.get("/me", requireAuth, async (c) => {
  const me = await getPlayer(c.env.db, c.var.playerId!);
  if (!me || me.deleted_at) {
    // The player was removed (or the database reset) under a still-valid cookie.
    clearSession(c);
    return c.json({ error: "Devi accedere" }, 401);
  }
  return c.json(toMeDTO(me));
});

api.delete("/session", (c) => {
  clearSession(c);
  return c.json({ ok: true });
});

/** Wipes the caller's personal data and signs them out. */
api.delete("/me", requireAuth, async (c) => {
  await deleteAccount(c.env.db, c.var.playerId!);
  clearSession(c);
  return c.json({ ok: true });
});

const profileSchema = z.object({
  name: z.string().trim().min(1, "Il nome non può essere vuoto").max(30, "Nome troppo lungo"),
  emoji: z.string().trim().min(1).max(16),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore non valido"),
  motto: z.string().trim().max(80, "Motto troppo lungo"),
});

api.put("/me", requireAuth, zValidator("json", profileSchema, invalid), async (c) => {
  const p = c.req.valid("json");
  await c.env.db
    .prepare("UPDATE players SET name = ?, emoji = ?, color = ?, motto = ? WHERE id = ?")
    .bind(p.name, p.emoji, p.color, p.motto, c.var.playerId)
    .run();
  return c.json(toMeDTO((await getPlayer(c.env.db, c.var.playerId!))!));
});

/** Claims a guest profile with the code a friend generated for it. */
api.post(
  "/me/claim",
  requireAuth,
  zValidator("json", z.object({ code: z.string().trim().toUpperCase().length(6, "Il codice ha 6 caratteri") }), invalid),
  async (c) => {
    const { code } = c.req.valid("json");
    const guest = await c.env.db
      .prepare("SELECT * FROM players WHERE claim_code = ? AND google_sub IS NULL AND deleted_at IS NULL")
      .bind(code)
      .first<PlayerRow>();
    if (!guest || !guest.claim_code_expires_at || guest.claim_code_expires_at < new Date().toISOString()) {
      return c.json({ error: "Codice non valido o scaduto" }, 404);
    }
    const outcome = await mergeGuestInto(c.env.db, guest.id, c.var.playerId!);
    if (outcome === "overlap") {
      return c.json({ error: "Hai giocato nella stessa partita di questo ospite: non può essere te" }, 409);
    }
    await recomputeRatings(c.env.db);
    return c.json({ claimed: toPlayerDTO(guest) });
  },
);

// ── Players ────────────────────────────────────────────────────────────────

api.get("/players", async (c) => {
  const { results } = await c.env.db.prepare("SELECT * FROM players WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE").all<PlayerRow>();
  return c.json(results.map(toPlayerDTO));
});

api.post(
  "/players/guests",
  requireAuth,
  zValidator("json", z.object({ name: profileSchema.shape.name }), invalid),
  async (c) => {
    const { name } = c.req.valid("json");
    const id = crypto.randomUUID();
    const look = defaultLook(id);
    await c.env.db
      .prepare("INSERT INTO players (id, name, emoji, color, created_by) VALUES (?, ?, ?, ?, ?)")
      .bind(id, name, look.emoji, look.color, c.var.playerId)
      .run();
    return c.json(toPlayerDTO((await getPlayer(c.env.db, id))!), 201);
  },
);

api.get("/players/:id/stats", async (c) => {
  const player = await getPlayer(c.env.db, c.req.param("id"));
  if (!player) return c.json({ error: "Giocatore non trovato" }, 404);
  return c.json(await playerStats(c.env.db, player));
});

/**
 * A code the guest's friend passes on, so that only the person it was meant
 * for can take over the guest's history. Whoever added the guest, or anyone
 * who has played with them, may generate one.
 */
api.post("/players/:id/claim-code", requireAuth, async (c) => {
  const guest = await getPlayer(c.env.db, c.req.param("id"));
  if (!guest || guest.google_sub !== null || guest.deleted_at) return c.json({ error: "Non è un profilo ospite" }, 404);
  const me = c.var.playerId!;
  const playedWith = await c.env.db
    .prepare(
      `SELECT 1 FROM match_players a JOIN match_players b ON a.match_id = b.match_id
        WHERE a.player_id = ? AND b.player_id = ? LIMIT 1`,
    )
    .bind(guest.id, me)
    .first();
  if (guest.created_by !== me && !playedWith) {
    return c.json({ error: "Solo chi ha creato l'ospite o ci ha giocato può generare il codice" }, 403);
  }
  const code = newClaimCode();
  const expiresAt = new Date(Date.now() + CLAIM_CODE_DAYS * 86_400_000).toISOString();
  await c.env.db
    .prepare("UPDATE players SET claim_code = ?, claim_code_expires_at = ? WHERE id = ?")
    .bind(code, expiresAt, guest.id)
    .run();
  return c.json<ClaimCodeDTO>({ code, expiresAt });
});

// ── Leaderboard ────────────────────────────────────────────────────────────

api.get("/leaderboard", async (c) => c.json(await leaderboard(c.env.db)));

// ── Matches ────────────────────────────────────────────────────────────────

const seat = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const handSchema = z.object({
  manoSeat: seat,
  points: z.tuple([z.number().int().min(0).max(11), z.number().int().min(0).max(11)]),
  maraffa: z.boolean(),
});
const matchSchema = z.object({
  id: z.uuid("Id partita non valido"),
  playedAt: z.iso.datetime({ offset: true }),
  seats: z.tuple([z.string(), z.string(), z.string(), z.string()]),
  sets: z
    .array(z.object({ target: z.union([z.literal(31), z.literal(41), z.literal(51)]), hands: z.array(handSchema).max(60) }))
    .min(1)
    .max(9),
});

api.get("/matches", async (c) => {
  const limit = Math.min(50, Math.max(1, Number(c.req.query("limit")) || 20));
  return c.json(
    await listMatches(c.env.db, {
      limit,
      playerId: c.req.query("player") || undefined,
      before: c.req.query("before") || undefined,
    }),
  );
});

api.get("/matches/:id", async (c) => {
  const match = await getMatchDetail(c.env.db, c.req.param("id"), c.var.playerId, await isAdmin(c));
  if (!match) return c.json({ error: "Partita non trovata" }, 404);
  return c.json(match);
});

api.post("/matches", requireAuth, zValidator("json", matchSchema, invalid), async (c) => {
  const body = c.req.valid("json");
  const me = c.var.playerId!;
  // A set opened but never played (the "next set?" prompt answered, then lunch ended) is not a set.
  const sets = body.sets.filter((s, i) => s.hands.length > 0 || i < body.sets.length - 1);
  const match: MatchSubmitDTO = { ...body, sets };

  // Submitting twice is how a flaky connection looks: the same id from the
  // same recorder is the same match, already stored.
  const existing = await getMatchRow(c.env.db, match.id);
  if (existing) {
    if (existing.recorded_by === me) return c.json({ id: match.id, duplicate: true });
    return c.json({ error: "Partita già registrata" }, 409);
  }

  if (new Set(match.seats).size !== 4) return c.json({ error: "Servono quattro giocatori diversi" }, 400);
  if (!match.seats.includes(me)) {
    return c.json({ error: "Puoi registrare solo le partite in cui hai giocato" }, 403);
  }
  if (Date.parse(match.playedAt) > Date.now() + 86_400_000) return c.json({ error: "Data nel futuro" }, 400);
  const problem = matchProblem(match);
  if (problem) return c.json({ error: problem }, 400);

  const { results: known } = await c.env.db
    .prepare(`SELECT id FROM players WHERE id IN (?, ?, ?, ?)`)
    .bind(...match.seats)
    .all<{ id: string }>();
  if (known.length !== 4) return c.json({ error: "Giocatore sconosciuto" }, 400);

  await insertMatch(c.env.db, match, me);
  await recomputeRatings(c.env.db, { id: match.id, players: [...match.seats] });
  return c.json({ id: match.id, duplicate: false }, 201);
});

api.post("/matches/:id/void", requireAuth, async (c) => {
  const m = await getMatchRow(c.env.db, c.req.param("id"));
  if (!m) return c.json({ error: "Partita non trovata" }, 404);
  if (m.voided_at) return c.json({ ok: true });
  if (!(await canVoid(c.env.db, m, c.var.playerId!)) && !(await isAdmin(c))) {
    return c.json({ error: "Solo chi ha giocato o registrato la partita (o un admin) può annullarla" }, 403);
  }
  await c.env.db
    .prepare("UPDATE matches SET voided_at = ?, voided_by = ? WHERE id = ?")
    .bind(new Date().toISOString(), c.var.playerId, m.id)
    .run();
  await recomputeRatings(c.env.db);
  return c.json({ ok: true });
});

export default api;
