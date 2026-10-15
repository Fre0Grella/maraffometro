import type { PartnerStatDTO, PlayerStatsDTO, Seat, Team } from "@maraffometro/shared";
import { leaderboard } from "./ratings";
import { listMatches } from "./matches";
import { playersById, toPlayerDTO, type PlayerRow } from "./players";

/** Fewer sets than this together and a win rate says more about luck than about the pairing. */
export const MIN_SETS_FOR_RATE = 3;

interface MySeatRow {
  match_id: string;
  seat: Seat;
  team: Team;
  winner_team: Team | null;
}

interface SetSeatRow {
  /** match id and set index: one key per set. */
  k: string;
  winner_team: Team;
  seat: Seat;
  player_id: string;
}

interface HandRow {
  match_id: string;
  mano_seat: Seat;
  points_a: number;
  points_b: number;
  maraffa_seat: Seat | null;
}

function rate(s: { sets: number; setsWon: number }): number {
  return s.sets === 0 ? 0 : s.setsWon / s.sets;
}

export async function playerStats(db: D1Database, player: PlayerRow): Promise<PlayerStatsDTO> {
  const id = player.id;
  const [mine, sets, hands] = await db.batch([
    db
      .prepare(
        `SELECT mp.match_id, mp.seat, mp.team, m.winner_team FROM match_players mp
           JOIN matches m ON m.id = mp.match_id
          WHERE mp.player_id = ? AND m.voided_at IS NULL
          ORDER BY m.played_at DESC`,
      )
      .bind(id),
    db
      .prepare(
        `SELECT s.match_id || ':' || s.set_index AS k, s.winner_team, mp.seat, mp.player_id FROM match_sets s
           JOIN matches m ON m.id = s.match_id
           JOIN match_players mp ON mp.match_id = s.match_id
          WHERE m.voided_at IS NULL AND s.winner_team IS NOT NULL
            AND s.match_id IN (SELECT match_id FROM match_players WHERE player_id = ?)`,
      )
      .bind(id),
    db
      .prepare(
        `SELECT h.match_id, h.mano_seat, h.points_a, h.points_b, h.maraffa_seat FROM hands h
           JOIN matches m ON m.id = h.match_id
          WHERE m.voided_at IS NULL
            AND h.match_id IN (SELECT match_id FROM match_players WHERE player_id = ?)`,
      )
      .bind(id),
  ]);
  const myMatches = mine!.results as MySeatRow[];
  const seatIn = new Map(myMatches.map((m) => [m.match_id, m]));

  // Matches and form.
  let matchesWon = 0;
  let matchesDrawn = 0;
  const form: ("W" | "L" | "D")[] = [];
  for (const m of myMatches) {
    const r = m.winner_team === null ? "D" : m.winner_team === m.team ? "W" : "L";
    if (r === "W") matchesWon++;
    if (r === "D") matchesDrawn++;
    if (form.length < 10) form.push(r);
  }

  // Sets, partners, opponents. Each set comes back once per seat; group them.
  const setsBy = new Map<string, { winner: Team; seats: string[] }>();
  for (const r of sets!.results as SetSeatRow[]) {
    let g = setsBy.get(r.k);
    if (!g) setsBy.set(r.k, (g = { winner: r.winner_team, seats: [] }));
    g.seats[r.seat] = r.player_id;
  }

  let setsPlayed = 0;
  let setsWon = 0;
  const partners = new Map<string, { sets: number; setsWon: number }>();
  const opponents = new Map<string, { sets: number; setsWon: number }>();
  const bump = (map: typeof partners, pid: string, won: boolean) => {
    const s = map.get(pid) ?? { sets: 0, setsWon: 0 };
    s.sets++;
    if (won) s.setsWon++;
    map.set(pid, s);
  };
  for (const { winner, seats } of setsBy.values()) {
    const mySeat = seats.indexOf(id);
    if (mySeat < 0) continue;
    const myTeam = (mySeat % 2) as Team;
    const won = winner === myTeam;
    setsPlayed++;
    if (won) setsWon++;
    bump(partners, seats[(mySeat + 2) % 4]!, won);
    bump(opponents, seats[(mySeat + 1) % 4]!, won);
    bump(opponents, seats[(mySeat + 3) % 4]!, won);
  }

  // Hands: maraffas and the di mano / fuori mano averages.
  let handsPlayed = 0;
  let maraffas = 0;
  let maraffasAgainst = 0;
  const mano = { hands: 0, points: 0 };
  const fuori = { hands: 0, points: 0 };
  for (const h of hands!.results as HandRow[]) {
    const me = seatIn.get(h.match_id);
    if (!me) continue;
    handsPlayed++;
    const myPoints = me.team === 0 ? h.points_a : h.points_b;
    const acc = h.mano_seat % 2 === me.team ? mano : fuori;
    acc.hands++;
    acc.points += myPoints;
    if (h.maraffa_seat === me.seat) maraffas++;
    else if (h.maraffa_seat !== null && h.maraffa_seat % 2 !== me.team) maraffasAgainst++;
  }

  const people = await playersById(db, [...partners.keys(), ...opponents.keys()]);
  const stat = (pid: string, s: { sets: number; setsWon: number }): PartnerStatDTO => ({
    player: toPlayerDTO(people.get(pid)!),
    ...s,
  });
  const entries = [...partners.entries()];
  const best = entries.sort((a, b) => b[1].setsWon - a[1].setsWon || rate(b[1]) - rate(a[1]))[0];
  const qualified = entries.filter(([, s]) => s.sets >= MIN_SETS_FOR_RATE);
  const worst = qualified.sort((a, b) => rate(a[1]) - rate(b[1]) || b[1].sets - a[1].sets)[0];
  const nemesis = [...opponents.entries()]
    .filter(([, s]) => s.sets >= MIN_SETS_FOR_RATE)
    .sort((a, b) => rate(a[1]) - rate(b[1]) || b[1].sets - a[1].sets)[0];

  const board = await leaderboard(db);
  return {
    player: toPlayerDTO(player),
    leaderboard: board.find((e) => e.player.id === id) ?? null,
    matchesPlayed: myMatches.length,
    matchesWon,
    matchesDrawn,
    setsPlayed,
    setsWon,
    handsPlayed,
    maraffas,
    maraffasAgainst,
    avgPointsMano: mano.hands ? mano.points / mano.hands : null,
    avgPointsFuoriMano: fuori.hands ? fuori.points / fuori.hands : null,
    bestPartner: best ? stat(best[0], best[1]) : null,
    // Only worth naming when it is a different person from the best one.
    worstPartner: worst && worst[0] !== best?.[0] ? stat(worst[0], worst[1]) : null,
    nemesis: nemesis && rate(nemesis[1]) < 0.5 ? stat(nemesis[0], nemesis[1]) : null,
    form,
    recentMatches: await listMatches(db, { playerId: id, limit: 10 }),
  };
}
