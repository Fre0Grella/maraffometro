/**
 * How much each result counts. Kept apart from the engine so the balance can be
 * read and tuned in one place; docs/ranking.md explains each number.
 */
import type { Observation } from "./engine";
import { DEFAULT_PRIOR_SD, fitStrengths, type Strength } from "./engine";

/** A finished set, or a decided match, as the ratings see it. */
export interface RatedResult {
  kind: "set" | "match";
  /** Player ids by seat; seats 0 and 2 are team A. */
  seats: readonly [string, string, string, string];
  winner: 0 | 1;
  /** Set results only. */
  score?: readonly [number, number];
  target?: number;
  playedAt: string;
}

/** Half-life of a result's weight, measured back from the most recent result. */
export const HALF_LIFE_DAYS = 180;
/** Longer sets have more hands and so less luck in them. */
export const TARGET_WEIGHT: Record<number, number> = { 31: 0.85, 41: 1, 51: 1.15 };
/** A decided match, on top of its sets: rewards closing it out, but sets carry most of it. */
export const MATCH_WEIGHT = 0.5;
/** A player with fewer finished sets than this is shown as provisional. */
export const PROVISIONAL_SETS = 8;

/**
 * Winning by more counts more, with diminishing returns — the shape of
 * FiveThirtyEight's log(margin) multiplier. The margin is taken relative to the
 * set length so 41–20 and 31–15 say about the same. A one-point win is still a
 * full win (weight ≈ 1); a whitewash counts about 1.8 times.
 */
export function marginWeight(score: readonly [number, number], target: number): number {
  const m = Math.min(1, Math.abs(score[0] - score[1]) / target);
  return 1 + 0.5 * Math.log1p(4 * m);
}

const DAY_MS = 86_400_000;

/**
 * Anchored to the newest result rather than to today, so ratings only change
 * when a match is recorded or voided — nobody's rating drifts overnight, and
 * the stored table never goes stale.
 */
export function decayWeight(playedAt: string, newest: string): number {
  const ageDays = Math.max(0, (Date.parse(newest) - Date.parse(playedAt)) / DAY_MS);
  return 0.5 ** (ageDays / HALF_LIFE_DAYS);
}

export function toObservations(results: readonly RatedResult[]): Observation[] {
  if (results.length === 0) return [];
  const newest = results.reduce((a, r) => (r.playedAt > a ? r.playedAt : a), results[0]!.playedAt);
  return results.map((r) => {
    let weight = decayWeight(r.playedAt, newest);
    if (r.kind === "set") {
      weight *= (TARGET_WEIGHT[r.target ?? 41] ?? 1) * marginWeight(r.score ?? [1, 0], r.target ?? 41);
    } else {
      weight *= MATCH_WEIGHT;
    }
    return {
      a: [r.seats[0], r.seats[2]],
      b: [r.seats[1], r.seats[3]],
      y: r.winner === 0 ? 1 : 0,
      weight,
    };
  });
}

/** The scale players see: Elo-like points, 1500 being the group average. */
export const DISPLAY_BASE = 1500;
export const DISPLAY_SCALE = 400 / Math.LN10;

export interface PlayerRating {
  rating: number;
  uncertainty: number;
  theta: number;
  setsRated: number;
}

export function computeRatings(
  results: readonly RatedResult[],
  warmStart?: ReadonlyMap<string, number>,
): Map<string, PlayerRating> {
  const strengths: Map<string, Strength> = fitStrengths(toObservations(results), {
    priorSd: DEFAULT_PRIOR_SD,
    warmStart,
  });
  const sets = new Map<string, number>();
  for (const r of results) {
    if (r.kind !== "set") continue;
    for (const id of r.seats) sets.set(id, (sets.get(id) ?? 0) + 1);
  }
  const out = new Map<string, PlayerRating>();
  for (const [id, s] of strengths) {
    out.set(id, {
      rating: DISPLAY_BASE + DISPLAY_SCALE * s.theta,
      uncertainty: DISPLAY_SCALE * s.sd,
      theta: s.theta,
      setsRated: sets.get(id) ?? 0,
    });
  }
  return out;
}
