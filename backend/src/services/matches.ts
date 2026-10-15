import {
  scoreMatch,
  type Hand,
  type MatchDetailDTO,
  type MatchSubmitDTO,
  type MatchSummaryDTO,
  type Seat,
  type SetTarget,
  type Team,
} from "@maraffometro/shared";
import { playersById, toPlayerDTO, type PlayerRow } from "./players";

interface MatchRow {
  id: string;
  played_at: string;
  recorded_by: string;
  sets_won_a: number;
  sets_won_b: number;
  winner_team: Team | null;
  voided_at: string | null;
  voided_by: string | null;
}

interface SeatRow {
  match_id: string;
  seat: Seat;
  player_id: string;
}

interface SetRow {
  match_id: string;
  set_index: number;
  target: SetTarget;
  score_a: number;
  score_b: number;
  winner_team: Team | null;
}

interface HandRow {
  set_index: number;
  hand_index: number;
  mano_seat: Seat;
  points_a: number;
  points_b: number;
  maraffa_seat: Seat | null;
}

/** Stores a match that has already passed `matchProblem`. One batch, so it lands whole or not at all. */
export async function insertMatch(db: D1Database, match: MatchSubmitDTO, recordedBy: string): Promise<void> {
  const result = scoreMatch(match);
  const stmts: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT INTO matches (id, played_at, recorded_by, sets_won_a, sets_won_b, winner_team) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(match.id, match.playedAt, recordedBy, result.setsWon[0], result.setsWon[1], result.winner),
  ];
  match.seats.forEach((playerId, seat) => {
    stmts.push(
      db
        .prepare("INSERT INTO match_players (match_id, seat, team, player_id) VALUES (?, ?, ?, ?)")
        .bind(match.id, seat, seat % 2, playerId),
    );
  });
  match.sets.forEach((set, i) => {
    if (set.hands.length === 0) return;
    const r = result.sets[i]!;
    stmts.push(
      db
        .prepare(
          "INSERT INTO match_sets (match_id, set_index, target, score_a, score_b, winner_team) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(match.id, i, set.target, r.score[0], r.score[1], r.winner),
    );
    set.hands.forEach((h, j) => {
      stmts.push(
        db
          .prepare(
            "INSERT INTO hands (match_id, set_index, hand_index, mano_seat, points_a, points_b, maraffa_seat) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(match.id, i, j, h.manoSeat, h.points[0], h.points[1], h.maraffaSeat),
      );
    });
  });
  await db.batch(stmts);
}

export async function getMatchRow(db: D1Database, id: string): Promise<MatchRow | null> {
  return db.prepare("SELECT * FROM matches WHERE id = ?").bind(id).first<MatchRow>();
}

export interface MatchQuery {
  playerId?: string;
  limit: number;
  /** Only matches played before this instant: keyset pagination. */
  before?: string;
  includeVoided?: boolean;
}

export async function listMatches(db: D1Database, q: MatchQuery): Promise<MatchSummaryDTO[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (!q.includeVoided) where.push("m.voided_at IS NULL");
  if (q.before) {
    where.push("m.played_at < ?");
    params.push(q.before);
  }
  if (q.playerId) {
    where.push("EXISTS (SELECT 1 FROM match_players mp WHERE mp.match_id = m.id AND mp.player_id = ?)");
    params.push(q.playerId);
  }
  const sql = `SELECT m.* FROM matches m ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY m.played_at DESC LIMIT ?`;
  const { results } = await db.prepare(sql).bind(...params, q.limit).all<MatchRow>();
  return summarise(db, results);
}

async function summarise(db: D1Database, rows: MatchRow[]): Promise<MatchSummaryDTO[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const marks = ids.map(() => "?").join(",");
  const [seats, sets] = await db.batch([
    db.prepare(`SELECT match_id, seat, player_id FROM match_players WHERE match_id IN (${marks})`).bind(...ids),
    db.prepare(`SELECT * FROM match_sets WHERE match_id IN (${marks}) ORDER BY set_index`).bind(...ids),
  ]);
  const seatRows = seats!.results as SeatRow[];
  const setRows = sets!.results as SetRow[];
  const players = await playersById(db, [...seatRows.map((s) => s.player_id), ...rows.map((r) => r.recorded_by)]);

  return rows.map((m) => toSummary(m, seatRows, setRows, players));
}

function toSummary(
  m: MatchRow,
  seatRows: SeatRow[],
  setRows: SetRow[],
  players: Map<string, PlayerRow>,
): MatchSummaryDTO {
  const seats = seatRows
    .filter((s) => s.match_id === m.id)
    .sort((a, b) => a.seat - b.seat)
    .map((s) => toPlayerDTO(players.get(s.player_id)!));
  return {
    id: m.id,
    playedAt: m.played_at,
    seats: seats as MatchSummaryDTO["seats"],
    sets: setRows
      .filter((s) => s.match_id === m.id)
      .map((s) => ({ target: s.target, score: [s.score_a, s.score_b], winner: s.winner_team })),
    setsWon: [m.sets_won_a, m.sets_won_b],
    winner: m.winner_team,
    recordedBy: toPlayerDTO(players.get(m.recorded_by)!),
    voided: m.voided_at !== null,
  };
}

export async function getMatchDetail(
  db: D1Database,
  id: string,
  viewerId: string | null,
): Promise<MatchDetailDTO | null> {
  const m = await getMatchRow(db, id);
  if (!m) return null;
  const [summary] = await summarise(db, [m]);
  const [hands, changes] = await db.batch([
    db.prepare("SELECT * FROM hands WHERE match_id = ? ORDER BY set_index, hand_index").bind(id),
    db.prepare("SELECT player_id, rating_before, rating_after FROM rating_changes WHERE match_id = ?").bind(id),
  ]);
  const bySet: Hand[][] = summary!.sets.map(() => []);
  for (const h of hands!.results as HandRow[]) {
    bySet[h.set_index]?.push({
      manoSeat: h.mano_seat,
      points: [h.points_a, h.points_b],
      maraffaSeat: h.maraffa_seat,
    });
  }
  return {
    ...summary!,
    hands: bySet,
    ratingChanges: (changes!.results as { player_id: string; rating_before: number; rating_after: number }[]).map(
      (c) => ({ playerId: c.player_id, before: Math.round(c.rating_before), after: Math.round(c.rating_after) }),
    ),
    canVoid: viewerId !== null && !summary!.voided && (await canVoid(db, m, viewerId)),
  };
}

/** Anyone who sat at the table, or whoever recorded the match, may void it. */
export async function canVoid(db: D1Database, m: MatchRow, playerId: string): Promise<boolean> {
  if (m.recorded_by === playerId) return true;
  const seated = await db
    .prepare("SELECT 1 FROM match_players WHERE match_id = ? AND player_id = ?")
    .bind(m.id, playerId)
    .first();
  return seated !== null;
}
