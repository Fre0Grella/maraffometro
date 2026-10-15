import type { LeaderboardEntryDTO, Seat, Team } from "@maraffometro/shared";
import { computeRatings, PROVISIONAL_SETS, type RatedResult } from "../rating/weights";
import { toPlayerDTO, type PlayerRow } from "./players";

interface ResultRow {
  match_id: string;
  played_at: string;
  set_index: number | null;
  target: number | null;
  score_a: number | null;
  score_b: number | null;
  winner_team: Team;
  seat: Seat;
  player_id: string;
}

/**
 * Everything the ratings are fitted on: every finished set of every match that
 * was not voided, plus one result per match that was decided over at least two
 * finished sets (a match stopped after one set is just that set).
 */
async function loadResults(db: D1Database): Promise<RatedResult[]> {
  const { results } = await db
    .prepare(
      `SELECT s.match_id, m.played_at, s.set_index, s.target, s.score_a, s.score_b, s.winner_team, mp.seat, mp.player_id
         FROM match_sets s
         JOIN matches m ON m.id = s.match_id
         JOIN match_players mp ON mp.match_id = s.match_id
        WHERE m.voided_at IS NULL AND s.winner_team IS NOT NULL
       UNION ALL
       SELECT m.id, m.played_at, NULL, NULL, NULL, NULL, m.winner_team, mp.seat, mp.player_id
         FROM matches m
         JOIN match_players mp ON mp.match_id = m.id
        WHERE m.voided_at IS NULL AND m.winner_team IS NOT NULL AND m.sets_won_a + m.sets_won_b >= 2`,
    )
    .all<ResultRow>();

  const grouped = new Map<string, { row: ResultRow; seats: string[] }>();
  for (const r of results) {
    const key = `${r.match_id}:${r.set_index ?? "match"}`;
    let g = grouped.get(key);
    if (!g) grouped.set(key, (g = { row: r, seats: [] }));
    g.seats[r.seat] = r.player_id;
  }
  return [...grouped.values()].map(({ row, seats }) => ({
    kind: row.set_index === null ? "match" : "set",
    seats: seats as [string, string, string, string],
    winner: row.winner_team,
    score: row.score_a === null ? undefined : [row.score_a, row.score_b!],
    target: row.target ?? undefined,
    playedAt: row.played_at,
  }));
}

/**
 * Refits every rating from the full history and replaces the stored table.
 * When a match was just recorded, also notes what it did to its four players.
 */
export async function recomputeRatings(db: D1Database, recordedMatch?: { id: string; players: string[] }): Promise<void> {
  const { results: previous } = await db
    .prepare("SELECT player_id, theta, rating FROM ratings")
    .all<{ player_id: string; theta: number; rating: number }>();
  const warm = new Map(previous.map((p) => [p.player_id, p.theta]));
  const before = new Map(previous.map((p) => [p.player_id, p.rating]));

  const ratings = computeRatings(await loadResults(db), warm);
  const now = new Date().toISOString();

  const stmts: D1PreparedStatement[] = [db.prepare("DELETE FROM ratings")];
  for (const [id, r] of ratings) {
    stmts.push(
      db
        .prepare(
          "INSERT INTO ratings (player_id, theta, rating, uncertainty, sets_rated, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(id, r.theta, r.rating, r.uncertainty, r.setsRated, now),
    );
  }
  if (recordedMatch) {
    for (const id of recordedMatch.players) {
      const after = ratings.get(id);
      if (!after) continue;
      stmts.push(
        db
          .prepare(
            "INSERT OR REPLACE INTO rating_changes (match_id, player_id, rating_before, rating_after) VALUES (?, ?, ?, ?)",
          )
          .bind(recordedMatch.id, id, before.get(id) ?? 1500, after.rating),
      );
    }
  }
  await db.batch(stmts);
}

interface LeaderRow extends PlayerRow {
  rating: number;
  uncertainty: number;
  sets_rated: number;
  sets_won: number;
  matches_played: number;
  matches_won: number;
  last_change: number | null;
}

export async function leaderboard(db: D1Database): Promise<LeaderboardEntryDTO[]> {
  const { results } = await db
    .prepare(
      `SELECT p.*, r.rating, r.uncertainty, r.sets_rated,
         (SELECT COUNT(*) FROM match_sets s JOIN matches m ON m.id = s.match_id
            JOIN match_players mp ON mp.match_id = s.match_id
           WHERE mp.player_id = p.id AND m.voided_at IS NULL AND s.winner_team = mp.team) AS sets_won,
         (SELECT COUNT(*) FROM matches m JOIN match_players mp ON mp.match_id = m.id
           WHERE mp.player_id = p.id AND m.voided_at IS NULL) AS matches_played,
         (SELECT COUNT(*) FROM matches m JOIN match_players mp ON mp.match_id = m.id
           WHERE mp.player_id = p.id AND m.voided_at IS NULL AND m.winner_team = mp.team) AS matches_won,
         (SELECT rc.rating_after - rc.rating_before FROM rating_changes rc JOIN matches m ON m.id = rc.match_id
           WHERE rc.player_id = p.id AND m.voided_at IS NULL ORDER BY m.played_at DESC LIMIT 1) AS last_change
       FROM ratings r JOIN players p ON p.id = r.player_id
       ORDER BY r.rating DESC`,
    )
    .all<LeaderRow>();

  // Provisional players are listed but not ranked: a number beside a name
  // that two lucky sets put there would be read as a verdict.
  let rank = 0;
  return results.map((r) => {
    const provisional = r.sets_rated < PROVISIONAL_SETS;
    if (!provisional) rank++;
    return {
      rank: provisional ? 0 : rank,
      player: toPlayerDTO(r),
      rating: Math.round(r.rating),
      uncertainty: Math.round(r.uncertainty),
      lastChange: r.last_change === null ? null : Math.round(r.last_change),
      provisional,
      setsPlayed: r.sets_rated,
      setsWon: r.sets_won,
      matchesPlayed: r.matches_played,
      matchesWon: r.matches_won,
    };
  });
}
