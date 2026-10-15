import { describe, expect, it } from "vitest";
import { computeRatings, marginWeight, type RatedResult } from "./weights";

const DAY = "2026-10-01T12:00:00.000Z";
const POOL = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];

function set(
  teamA: [string, string],
  teamB: [string, string],
  aWins: boolean,
  { score, target = 41, playedAt = DAY }: { score?: [number, number]; target?: number; playedAt?: string } = {},
): RatedResult {
  const s: [number, number] = score ?? (aWins ? [43, 30] : [30, 43]);
  return {
    kind: "set",
    seats: [teamA[0], teamB[0], teamA[1], teamB[1]],
    winner: aWins ? 0 : 1,
    score: s,
    target,
    playedAt,
  };
}

/** Average players playing each other, every pairing even: a backdrop of 50% results. */
function poolGames(count: number, offset = 0): RatedResult[] {
  const out: RatedResult[] = [];
  for (let i = 0; i < count; i++) {
    const k = i + offset;
    const pick = (j: number) => POOL[(k * 3 + j * 2 + Math.floor(k / 8)) % POOL.length]!;
    const ids = [pick(0), pick(1), pick(2), pick(3)];
    if (new Set(ids).size < 4) continue;
    out.push(set([ids[0]!, ids[1]!], [ids[2]!, ids[3]!], k % 2 === 0));
  }
  return out;
}

/** `player`, partnered with someone from the pool, against two pool players. */
function withPool(player: string, games: number, wins: number, offset = 0): RatedResult[] {
  return Array.from({ length: games }, (_, i) => {
    const k = i + offset;
    const partner = POOL[k % 8]!;
    const opp: [string, string] = [POOL[(k + 3) % 8]!, POOL[(k + 5) % 8]!];
    // Spread the wins evenly through the sequence, not all at the start.
    const win = Math.floor(((i + 1) * wins) / games) > Math.floor((i * wins) / games);
    return set([player, partner], opp, win);
  });
}

const rating = (r: Map<string, { rating: number }>, id: string) => r.get(id)!.rating;

describe("the ranking does not reward volume", () => {
  it("does not put a 3–0 newcomer above a 60-of-100 regular", () => {
    const results = [...poolGames(200), ...withPool("rookie", 3, 3), ...withPool("regular", 100, 60, 50)];
    const r = computeRatings(results);
    expect(rating(r, "regular")).toBeGreaterThan(rating(r, "rookie"));
    // …while still placing the newcomer above average, just not by much.
    expect(rating(r, "rookie")).toBeGreaterThan(1500);
  });

  it("does not raise anyone for piling up even games", () => {
    const history = [...poolGames(200), ...withPool("strong", 20, 15)];
    const before = rating(computeRatings(history), "strong");
    const after = rating(computeRatings([...history, ...withPool("strong", 60, 30, 20)]), "strong");
    expect(after).toBeLessThanOrEqual(before + 1e-6);
  });

  it("keeps a 50% player at the average however many games they play", () => {
    for (const n of [10, 40, 160]) {
      const r = computeRatings([...poolGames(200), ...withPool("steady", n, n / 2)]);
      expect(Math.abs(rating(r, "steady") - 1500)).toBeLessThan(15);
    }
  });

  it("gives few games a large uncertainty and many games a small one", () => {
    const r = computeRatings([...poolGames(200), ...withPool("rookie", 3, 2), ...withPool("regular", 100, 50, 30)]);
    expect(r.get("rookie")!.uncertainty).toBeGreaterThan(1.4 * r.get("regular")!.uncertainty);
  });
});

describe("partners and opponents", () => {
  it("rates a carried partner below the player who carried them", () => {
    // `star` wins 75% with anyone. `passenger` only ever plays beside `star`, at the same 75%.
    const passengerGames = Array.from({ length: 40 }, (_, i) =>
      set(["star", "passenger"], [POOL[i % 8]!, POOL[(i + 4) % 8]!], i % 4 !== 0),
    );
    const r = computeRatings([...poolGames(200), ...withPool("star", 40, 30), ...passengerGames]);
    expect(rating(r, "star")).toBeGreaterThan(rating(r, "passenger") + 50);
  });

  it("values a win over strong players more than one over weak players", () => {
    const strongPool = withPool("ace", 30, 24); // ace is strong
    const vsAce = Array.from({ length: 10 }, (_, i) => set(["giant", POOL[i % 8]!], ["ace", POOL[(i + 2) % 8]!], i % 2 === 0));
    const vsPool = Array.from({ length: 10 }, (_, i) => set(["minnow", POOL[i % 8]!], [POOL[(i + 1) % 8]!, POOL[(i + 2) % 8]!], i % 2 === 0));
    const r = computeRatings([...poolGames(200), ...strongPool, ...vsAce, ...vsPool]);
    expect(rating(r, "giant")).toBeGreaterThan(rating(r, "minnow"));
  });
});

describe("weights", () => {
  it("counts a narrow win as a full win and a rout as more, with diminishing returns", () => {
    expect(marginWeight([42, 40], 41)).toBeGreaterThan(1);
    expect(marginWeight([42, 40], 41)).toBeLessThan(1.1);
    const half = marginWeight([41, 20], 41) - 1;
    const full = marginWeight([44, 0], 41) - 1;
    expect(full).toBeGreaterThan(half);
    expect(full).toBeLessThan(2 * half);
  });

  it("rates a player who wins big above one who wins narrowly", () => {
    const big = Array.from({ length: 10 }, (_, i) => set(["big", POOL[i % 8]!], [POOL[(i + 3) % 8]!, POOL[(i + 5) % 8]!], i % 3 !== 0, { score: i % 3 !== 0 ? [44, 12] : [30, 41] }));
    const narrow = Array.from({ length: 10 }, (_, i) => set(["narrow", POOL[i % 8]!], [POOL[(i + 3) % 8]!, POOL[(i + 5) % 8]!], i % 3 !== 0, { score: i % 3 !== 0 ? [42, 39] : [30, 41] }));
    const r = computeRatings([...poolGames(200), ...big, ...narrow]);
    expect(rating(r, "big")).toBeGreaterThan(rating(r, "narrow"));
  });

  it("lets recent results count more than old ones", () => {
    const at = (d: number) => new Date(Date.parse(DAY) + d * 86_400_000).toISOString();
    const vs = (i: number): [string, string] => [POOL[(i + 3) % 8]!, POOL[(i + 5) % 8]!];
    const riser = [
      ...Array.from({ length: 10 }, (_, i) => set(["riser", POOL[i % 8]!], vs(i), false, { playedAt: at(0) })),
      ...Array.from({ length: 10 }, (_, i) => set(["riser", POOL[i % 8]!], vs(i), true, { playedAt: at(365) })),
    ];
    const faller = [
      ...Array.from({ length: 10 }, (_, i) => set(["faller", POOL[i % 8]!], vs(i), true, { playedAt: at(0) })),
      ...Array.from({ length: 10 }, (_, i) => set(["faller", POOL[i % 8]!], vs(i), false, { playedAt: at(365) })),
    ];
    const r = computeRatings([...poolGames(200).map((g) => ({ ...g, playedAt: at(200) })), ...riser, ...faller]);
    expect(rating(r, "riser")).toBeGreaterThan(1500);
    expect(rating(r, "faller")).toBeLessThan(1500);
  });

  it("does not change when every date moves by the same amount", () => {
    const results = [...poolGames(100), ...withPool("x", 12, 9)].map((g, i) => ({
      ...g,
      playedAt: new Date(Date.parse(DAY) + i * 86_400_000).toISOString(),
    }));
    const shifted = results.map((g) => ({ ...g, playedAt: new Date(Date.parse(g.playedAt) + 90 * 86_400_000).toISOString() }));
    expect(rating(computeRatings(shifted), "x")).toBeCloseTo(rating(computeRatings(results), "x"), 9);
  });

  it("does not depend on the order results are listed in", () => {
    const results = [...poolGames(100), ...withPool("x", 12, 9)];
    const reversed = [...results].reverse();
    expect(rating(computeRatings(reversed), "x")).toBeCloseTo(rating(computeRatings(results), "x"), 9);
  });
});

describe("cost", () => {
  it("refits 2000 sets among 25 players well inside a Worker's CPU budget", () => {
    const players = Array.from({ length: 25 }, (_, i) => `u${i}`);
    const skill = players.map((_, i) => (i - 12) / 12);
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const results: RatedResult[] = [];
    for (let i = 0; i < 2000; i++) {
      const picks = new Set<number>();
      while (picks.size < 4) picks.add(Math.floor(rand() * 25));
      const [a1, b1, a2, b2] = [...picks];
      const p = 1 / (1 + Math.exp(-(skill[a1!]! + skill[a2!]! - skill[b1!]! - skill[b2!]!)));
      const aWins = rand() < p;
      results.push(set([players[a1!]!, players[a2!]!], [players[b1!]!, players[b2!]!], aWins, {
        playedAt: new Date(Date.parse(DAY) - (2000 - i) * 3_600_000).toISOString(),
      }));
    }
    const cold = computeRatings(results);
    const warm = new Map([...cold].map(([id, r]) => [id, r.theta]));
    const t0 = performance.now();
    const again = computeRatings(results, warm);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(25);
    // The fit recovers the order of the skills it was generated from.
    expect(again.get("u24")!.rating).toBeGreaterThan(again.get("u12")!.rating);
    expect(again.get("u12")!.rating).toBeGreaterThan(again.get("u0")!.rating);
  });
});
