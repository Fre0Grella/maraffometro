/**
 * The Maraffa rules the app needs, and nothing more: how a hand is scored, when
 * a set ends, who wins a match. Shared by the live tracker, which plays them
 * forward one hand at a time, and by the Worker, which replays a submitted match
 * to check it before storing it — so the two can never disagree on a score.
 *
 * Table layout: seats are numbered in playing order (0 → 1 → 2 → 3, the
 * direction the deal and the lead move). Partners sit opposite, so seats 0 and 2
 * are team A and seats 1 and 3 are team B.
 */

/** Card points in one hand once the thirds are dropped: 10 from the cards, 1 for the last trick. */
export const HAND_POINTS = 11;

/** Ace, two and three of the trump suit in one hand. */
export const MARAFFA_BONUS = 3;

export const SET_TARGETS = [31, 41, 51] as const;
export type SetTarget = (typeof SET_TARGETS)[number];

export type Seat = 0 | 1 | 2 | 3;
/** 0 is team A (seats 0 and 2), 1 is team B (seats 1 and 3). */
export type Team = 0 | 1;

export const SEATS: readonly Seat[] = [0, 1, 2, 3];

export function teamOfSeat(seat: Seat): Team {
  return (seat % 2) as Team;
}

export function otherTeam(team: Team): Team {
  return (1 - team) as Team;
}

export function seatsOfTeam(team: Team): [Seat, Seat] {
  return team === 0 ? [0, 2] : [1, 3];
}

/** The lead passes to the next seat every hand, so the team "di mano" alternates. */
export function nextManoSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function isSetTarget(n: number): n is SetTarget {
  return (SET_TARGETS as readonly number[]).includes(n);
}

export interface Hand {
  /** The player who led the hand and called trumps. Their team is "di mano". */
  manoSeat: Seat;
  /** Card points per team, [A, B], maraffa bonus excluded. */
  points: [number, number];
  /** Who held the maraffa this hand, if anyone. */
  maraffaSeat: Seat | null;
}

/**
 * Builds a hand from what the tracker asks for: the points of the team di mano.
 * The other team takes the rest of the eleven.
 */
export function handFromManoPoints(
  manoSeat: Seat,
  manoPoints: number,
  maraffaSeat: Seat | null,
): Hand {
  const mano = teamOfSeat(manoSeat);
  const points: [number, number] = [0, 0];
  points[mano] = manoPoints;
  points[otherTeam(mano)] = HAND_POINTS - manoPoints;
  return { manoSeat, points, maraffaSeat };
}

/** What a hand adds to each team's set score, maraffa included. */
export function handScore(hand: Hand): [number, number] {
  const score: [number, number] = [hand.points[0], hand.points[1]];
  if (hand.maraffaSeat !== null) score[teamOfSeat(hand.maraffaSeat)] += MARAFFA_BONUS;
  return score;
}

export interface SetRecord {
  target: SetTarget;
  hands: Hand[];
}

export interface SetResult {
  score: [number, number];
  /** Null while the set is still being played (or was abandoned). */
  winner: Team | null;
  /** How many hands were played when the set was decided; equals hands.length when valid. */
  decidedAtHand: number | null;
}

/**
 * The set is checked at the end of every hand: a team that has reached the
 * target wins it. If both have, the higher score wins, and an exact tie plays
 * another hand.
 */
export function winnerAfter(score: [number, number], target: SetTarget): Team | null {
  const [a, b] = score;
  if (a < target && b < target) return null;
  if (a === b) return null;
  return a > b ? 0 : 1;
}

export function scoreSet(set: SetRecord): SetResult {
  const score: [number, number] = [0, 0];
  for (let i = 0; i < set.hands.length; i++) {
    const [a, b] = handScore(set.hands[i]!);
    score[0] += a;
    score[1] += b;
    const winner = winnerAfter(score, set.target);
    if (winner !== null) return { score, winner, decidedAtHand: i + 1 };
  }
  return { score, winner: null, decidedAtHand: null };
}

export interface MatchRecord {
  sets: SetRecord[];
}

export interface MatchResult {
  sets: SetResult[];
  setsWon: [number, number];
  /** Null for a draw, which only happens when a match is stopped level. */
  winner: Team | null;
}

export function scoreMatch(match: MatchRecord): MatchResult {
  const sets = match.sets.map(scoreSet);
  const setsWon: [number, number] = [0, 0];
  for (const s of sets) if (s.winner !== null) setsWon[s.winner]++;
  const winner = setsWon[0] === setsWon[1] ? null : setsWon[0] > setsWon[1] ? 0 : 1;
  return { sets, setsWon, winner };
}

/**
 * Why a match, as submitted, cannot have been played — or null if it can.
 * Every set but the last must be finished exactly on its final hand; the last
 * may be unfinished, which is how a match cut short by the end of lunch looks.
 */
export function matchProblem(match: MatchRecord): string | null {
  if (match.sets.length === 0) return "la partita non ha set";
  const handCount = match.sets.reduce((n, s) => n + s.hands.length, 0);
  if (handCount === 0) return "la partita non ha mani";

  for (let i = 0; i < match.sets.length; i++) {
    const set = match.sets[i]!;
    if (!isSetTarget(set.target)) return `set ${i + 1}: obiettivo non valido`;
    for (const [j, hand] of set.hands.entries()) {
      const where = `set ${i + 1}, mano ${j + 1}`;
      for (const p of hand.points) {
        if (!Number.isInteger(p) || p < 0 || p > HAND_POINTS) return `${where}: punti non validi`;
      }
      if (hand.points[0] + hand.points[1] > HAND_POINTS) return `${where}: più di ${HAND_POINTS} punti`;
    }
    const result = scoreSet(set);
    const isLast = i === match.sets.length - 1;
    if (result.decidedAtHand !== null && result.decidedAtHand !== set.hands.length) {
      return `set ${i + 1}: mani registrate dopo la fine del set`;
    }
    if (!isLast && result.winner === null) return `set ${i + 1}: non è finito`;
  }
  return null;
}
