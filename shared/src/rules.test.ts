import { describe, expect, it } from "vitest";
import {
  handFromManoPoints,
  handScore,
  matchProblem,
  nextManoSeat,
  scoreMatch,
  scoreSet,
  type Hand,
  type Seat,
  type SetRecord,
} from "./rules";

/** Hands where the given team always takes `pts` of the eleven, lead rotating from seat 0. */
function hands(spec: [manoPoints: number, maraffa?: Seat][], firstMano: Seat = 0): Hand[] {
  let mano = firstMano;
  return spec.map(([p, m]) => {
    const h = handFromManoPoints(mano, p, m ?? null);
    mano = nextManoSeat(mano);
    return h;
  });
}

describe("hands", () => {
  it("gives the other pair the rest of the eleven", () => {
    expect(handFromManoPoints(1, 7, null).points).toEqual([4, 7]);
    expect(handFromManoPoints(2, 7, null).points).toEqual([7, 4]);
  });

  it("adds the maraffa to the team that held it, whoever was di mano", () => {
    expect(handScore(handFromManoPoints(0, 6, 0))).toEqual([9, 5]);
    expect(handScore(handFromManoPoints(0, 6, 3))).toEqual([6, 8]);
  });

  it("passes the lead around the table", () => {
    expect([0, 1, 2, 3].map((s) => nextManoSeat(s as Seat))).toEqual([1, 2, 3, 0]);
  });
});

describe("sets", () => {
  it("ends on the hand a team reaches the target", () => {
    // A takes 11 every hand: 11, 22, 33 ≥ 31 after the third hand.
    const set: SetRecord = { target: 31, hands: hands([[11], [0], [11]]) };
    expect(scoreSet(set)).toEqual({ score: [33, 0], winner: 0, decidedAtHand: 3 });
  });

  it("gives the set to the higher score when both pass the target", () => {
    const set: SetRecord = {
      target: 31,
      hands: [
        { manoSeat: 0, points: [5, 6], maraffaSeat: null },
        { manoSeat: 1, points: [5, 6], maraffaSeat: null },
        { manoSeat: 2, points: [5, 6], maraffaSeat: null },
        { manoSeat: 3, points: [5, 6], maraffaSeat: null },
        { manoSeat: 0, points: [5, 6], maraffaSeat: null }, // 25–30
        { manoSeat: 1, points: [8, 3], maraffaSeat: 0 }, // 36–33
      ],
    };
    expect(scoreSet(set).winner).toBe(0);
  });

  it("plays on from an exact tie above the target", () => {
    const tied: SetRecord = {
      target: 31,
      hands: [
        { manoSeat: 0, points: [11, 0], maraffaSeat: null },
        { manoSeat: 1, points: [0, 11], maraffaSeat: null },
        { manoSeat: 2, points: [11, 0], maraffaSeat: null },
        { manoSeat: 3, points: [0, 11], maraffaSeat: null }, // 22–22
        { manoSeat: 0, points: [5, 6], maraffaSeat: 0 }, // 30–28
        { manoSeat: 1, points: [2, 9], maraffaSeat: null }, // 32–37 → B
      ],
    };
    expect(scoreSet({ ...tied, hands: tied.hands.slice(0, 5) }).winner).toBeNull();
    expect(scoreSet(tied).winner).toBe(1);
    const exactTie: SetRecord = {
      target: 31,
      hands: [...tied.hands.slice(0, 4), { manoSeat: 0, points: [9, 2], maraffaSeat: 1 }], // reaches 31 exactly: 31–27 → A
    };
    expect(scoreSet(exactTie).winner).toBe(0);
    const split = (a: number): Hand => ({ manoSeat: 0, points: [a, 11 - a], maraffaSeat: null });
    // 27–28 after five hands, then 33–33: both past 31, level, so play on.
    const level: SetRecord = { target: 31, hands: [5, 6, 5, 6, 5, 6].map(split) };
    expect(scoreSet(level)).toEqual({ score: [33, 33], winner: null, decidedAtHand: null });
    expect(scoreSet({ ...level, hands: [...level.hands, split(6)] }).winner).toBe(0);
  });
});

describe("matches", () => {
  /** Team A takes all eleven points every hand until the set is over. */
  const sweep = (target: 31 | 41 | 51): SetRecord => ({
    target,
    hands: hands(Array.from({ length: Math.ceil(target / 11) }, (_, i) => [i % 2 === 0 ? 11 : 0] as [number])),
  });

  it("counts sets to find the winner", () => {
    const r = scoreMatch({ sets: [sweep(31), sweep(41)] });
    expect(r.setsWon).toEqual([2, 0]);
    expect(r.winner).toBe(0);
  });

  it("calls a level match stopped early a draw", () => {
    const bWins: SetRecord = { target: 31, hands: hands([[0], [11], [0]], 0) };
    const r = scoreMatch({ sets: [sweep(31), bWins] });
    expect(r.setsWon).toEqual([1, 1]);
    expect(r.winner).toBeNull();
  });

  it("accepts an unfinished last set", () => {
    expect(matchProblem({ sets: [sweep(31), { target: 41, hands: hands([[6]]) }] })).toBeNull();
  });

  it("rejects an unfinished set that is not the last", () => {
    expect(matchProblem({ sets: [{ target: 41, hands: hands([[6]]) }, sweep(31)] })).toMatch(/non è finito/);
  });

  it("rejects hands after the set was decided", () => {
    const s = sweep(31);
    expect(matchProblem({ sets: [{ ...s, hands: [...s.hands, ...hands([[3]])] }] })).toMatch(/dopo la fine/);
  });

  it("rejects impossible points", () => {
    const bad: Hand = { manoSeat: 0, points: [9, 9], maraffaSeat: null };
    expect(matchProblem({ sets: [{ target: 31, hands: [bad] }] })).toMatch(/più di 11/);
  });
});
