import { beforeEach, describe, expect, it } from "vitest";
import {
  handFromManoPoints,
  nextManoSeat,
  type Hand,
  type LeaderboardEntryDTO,
  type MatchDetailDTO,
  type MatchSubmitDTO,
  type MeDTO,
  type NotificationsDTO,
  type PlayerDTO,
  type PlayerStatsDTO,
  type Seat,
} from "@maraffometro/shared";
import { createApp } from "../src/index";
import { createTestD1, queryCount } from "./d1";

const app = createApp();
let env: Record<string, unknown>;

beforeEach(() => {
  env = { db: createTestD1(), JWT_SECRET: "test-secret", FRONTEND_URL: "http://localhost:5173", ENVIRONMENT: "local" };
});

async function login(name: string): Promise<{ cookie: string; me: MeDTO }> {
  const res = await app.request(`/auth/dev?name=${name}`, {}, env);
  expect(res.status).toBe(302);
  const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
  const me = (await (await app.request("/api/v1/me", { headers: { cookie } }, env)).json()) as MeDTO;
  return { cookie, me };
}

function call(method: string, path: string, cookie?: string, body?: unknown) {
  return app.request(
    `/api/v1${path}`,
    {
      method,
      headers: { ...(cookie ? { cookie } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    },
    env,
  );
}

async function guest(cookie: string, name: string): Promise<PlayerDTO> {
  const res = await call("POST", "/players/guests", cookie, { name });
  expect(res.status).toBe(201);
  return (await res.json()) as PlayerDTO;
}

/**
 * A set the given team wins taking 8 of the 11 every hand. Its first hand di
 * mano declares a maraffa, the only kind there is.
 */
function setWonBy(team: 0 | 1, target: 31 | 41 | 51, firstMano: Seat = 0): { target: 31 | 41 | 51; hands: Hand[] } {
  const hands: Hand[] = [];
  let mano = firstMano;
  let score = 0;
  let maraffaDone = false;
  while (score < target) {
    const winnerIsMano = mano % 2 === team;
    const maraffa: boolean = winnerIsMano && !maraffaDone;
    maraffaDone ||= maraffa;
    hands.push(handFromManoPoints(mano, winnerIsMano ? 8 : 3, maraffa));
    score += 8 + (maraffa ? 3 : 0);
    mano = nextManoSeat(mano);
  }
  return { target, hands };
}

let clock = Date.parse("2026-10-01T12:00:00Z");

function match(seats: string[], sets: ReturnType<typeof setWonBy>[]): MatchSubmitDTO {
  clock += 3_600_000; // one match an hour, so "most recent" is well defined
  return {
    id: crypto.randomUUID(),
    playedAt: new Date(clock).toISOString(),
    seats: seats as MatchSubmitDTO["seats"],
    sets,
  };
}

describe("recording a match", () => {
  it("stores it, rates it, and recognises a resubmission", async () => {
    const { cookie, me } = await login("Marco");
    const [g1, g2, g3] = [await guest(cookie, "Ale"), await guest(cookie, "Bea"), await guest(cookie, "Cico")];
    const m = match([me.id, g1.id, g2.id, g3.id], [setWonBy(0, 41), setWonBy(1, 31), setWonBy(0, 41)]);

    const first = await call("POST", "/matches", cookie, m);
    expect(first.status).toBe(201);
    const again = await call("POST", "/matches", cookie, m);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ id: m.id, duplicate: true });

    const board = (await (await call("GET", "/leaderboard")).json()) as LeaderboardEntryDTO[];
    expect(board).toHaveLength(4);
    const mine = board.find((e) => e.player.id === me.id)!;
    expect(mine.rating).toBeGreaterThan(1500);
    expect(mine.provisional).toBe(true);
    // Ranked from the first set, provisional or not.
    expect(board.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
    expect(mine.rank).toBeLessThanOrEqual(2);
    expect(mine.matchesWon).toBe(1);
    expect(mine.setsWon).toBe(2);

    const detail = (await (await call("GET", `/matches/${m.id}`, cookie)).json()) as MatchDetailDTO;
    expect(detail.setsWon).toEqual([2, 1]);
    expect(detail.winner).toBe(0);
    expect(detail.hands).toHaveLength(3);
    expect(detail.ratingChanges).toHaveLength(4);
    expect(detail.canProposeDeletion).toBe(true);
  });

  it("computes the player's stats", async () => {
    const { cookie, me } = await login("Marco");
    const [g1, g2, g3] = [await guest(cookie, "Ale"), await guest(cookie, "Bea"), await guest(cookie, "Cico")];
    await call("POST", "/matches", cookie, match([me.id, g1.id, g2.id, g3.id], [setWonBy(0, 31), setWonBy(0, 31)]));
    await call("POST", "/matches", cookie, match([me.id, g2.id, g3.id, g1.id], [setWonBy(1, 31), setWonBy(1, 31)]));
    await call("POST", "/matches", cookie, match([me.id, g1.id, g3.id, g2.id], [setWonBy(0, 31), setWonBy(1, 31)]));

    const stats = (await (await call("GET", `/players/${me.id}/stats`)).json()) as PlayerStatsDTO;
    expect(stats.matchesPlayed).toBe(3);
    expect(stats.matchesWon).toBe(1);
    expect(stats.matchesDrawn).toBe(1);
    expect(stats.setsPlayed).toBe(6);
    expect(stats.setsWon).toBe(3);
    // Seat 0 holds the maraffa in each set team A wins: three of them.
    expect(stats.maraffas).toBe(3);
    expect(stats.maraffasAgainst).toBe(3);
    // Bea partnered Marco in the 2–0 win: the most sets won together.
    expect(stats.bestPartner?.player.name).toBe("Bea");
    expect(stats.form).toEqual(["D", "L", "W"]);
    expect(stats.avgPointsMano).not.toBeNull();
    expect(stats.avgPointsMano! + stats.avgPointsFuoriMano!).toBeGreaterThan(0);
  });

  it("counts 11-0 and 14-0 hands and finds the best set won", async () => {
    const { cookie, me } = await login("Marco");
    const gs = [await guest(cookie, "Ale"), await guest(cookie, "Bea"), await guest(cookie, "Cico")];
    const h = (manoSeat: Seat, a: number, b: number, maraffa = false): Hand => ({ manoSeat, points: [a, b], maraffa });
    // Set 1, Marco's pair (A) wins 36–0: a 14-0 (their maraffa) and two 11-0.
    const whitewash = { target: 31 as const, hands: [h(0, 11, 0, true), h(1, 11, 0), h(2, 11, 0)] };
    // Set 2, B wins 33–8 with two 11-0 of their own, which Marco suffered: not counted for him.
    const lost = { target: 31 as const, hands: [h(3, 0, 11), h(0, 4, 7), h(1, 0, 11), h(2, 4, 4)] };
    // Set 3, A wins 41–33 (B ends on a maraffa): a narrower win, so set 1 stays the best.
    const close = {
      target: 41 as const,
      hands: [h(3, 6, 5), h(0, 6, 5), h(1, 6, 5), h(2, 6, 5), h(3, 6, 5), h(0, 6, 5), h(1, 5, 0, true)],
    };
    const m = match([me.id, ...gs.map((g) => g.id)], [whitewash, lost, close]);
    expect((await call("POST", "/matches", cookie, m)).status).toBe(201);

    const stats = (await (await call("GET", `/players/${me.id}/stats`)).json()) as PlayerStatsDTO;
    expect(stats.fourteenZero).toBe(1);
    expect(stats.elevenZero).toBe(2);
    expect(stats.bestSet).toMatchObject({ matchId: m.id, score: [36, 0], margin: 36, target: 31 });

    // From the other side of the table, the two 11-0 in set 2 are theirs and the best set is 33–8.
    const theirs = (await (await call("GET", `/players/${gs[0]!.id}/stats`)).json()) as PlayerStatsDTO;
    expect(theirs.elevenZero).toBe(2);
    expect(theirs.fourteenZero).toBe(0);
    expect(theirs.bestSet).toMatchObject({ score: [33, 8], margin: 25 });
  });

  it("saves a long best-of-three within D1's 50 queries per request", async () => {
    const { cookie, me } = await login("Marco");
    const gs = [];
    for (let i = 0; i < 20; i++) gs.push(await guest(cookie, `G${i}`)); // a bigger group to rate
    for (let i = 0; i < 6; i++) {
      await call("POST", "/matches", cookie, match([me.id, gs[i]!.id, gs[i + 6]!.id, gs[i + 12]!.id], [setWonBy(0, 31)]));
    }
    const long = match([me.id, gs[0]!.id, gs[1]!.id, gs[2]!.id], [setWonBy(0, 51), setWonBy(1, 51), setWonBy(0, 51)]);
    queryCount.value = 0;
    expect((await call("POST", "/matches", cookie, long)).status).toBe(201);
    expect(queryCount.value).toBeLessThan(20);
  });

  it("refuses a match the recorder did not play in", async () => {
    const { cookie } = await login("Marco");
    const gs = [await guest(cookie, "A"), await guest(cookie, "B"), await guest(cookie, "C"), await guest(cookie, "D")];
    const res = await call("POST", "/matches", cookie, match(gs.map((g) => g.id), [setWonBy(0, 31)]));
    expect(res.status).toBe(403);
  });

  it("refuses a match that cannot have been played", async () => {
    const { cookie, me } = await login("Marco");
    const gs = [await guest(cookie, "A"), await guest(cookie, "B"), await guest(cookie, "C")];
    const unfinished = { target: 41 as const, hands: [handFromManoPoints(0, 6)] };
    const res = await call("POST", "/matches", cookie, match([me.id, ...gs.map((g) => g.id)], [unfinished, setWonBy(0, 31)]));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error).toBe("invalid_match");
    expect(body.message).toMatch(/not finished/);
  });

  it("requires a session to write", async () => {
    expect((await call("POST", "/players/guests", undefined, { name: "X" })).status).toBe(401);
  });

  it("deletes at once when the proposer is the only registered player", async () => {
    const { cookie, me } = await login("Marco");
    const gs = [await guest(cookie, "A"), await guest(cookie, "B"), await guest(cookie, "C")];
    const m = match([me.id, ...gs.map((g) => g.id)], [setWonBy(0, 31)]);
    await call("POST", "/matches", cookie, m);
    expect(((await (await call("GET", "/leaderboard")).json()) as unknown[]).length).toBe(4);

    const { cookie: stranger } = await login("Intruso");
    expect((await call("POST", `/matches/${m.id}/deletion`, stranger)).status).toBe(403);
    // Direct voiding is for admins only now.
    expect((await call("POST", `/matches/${m.id}/void`, cookie)).status).toBe(403);

    const res = await call("POST", `/matches/${m.id}/deletion`, cookie);
    expect(await res.json()).toEqual({ status: "approved" });
    expect(((await (await call("GET", "/leaderboard")).json()) as unknown[]).length).toBe(0);
  });
});

describe("deleting a match by vote", () => {
  /** Four registered players around one table, and a recorded match. */
  async function table() {
    const players = [await login("Marco"), await login("Nico"), await login("Ale"), await login("Bea")];
    const m = match(players.map((p) => p.me.id), [setWonBy(0, 31)]);
    expect((await call("POST", "/matches", players[0]!.cookie, m)).status).toBe(201);
    return { players, m };
  }

  const detail = async (id: string, cookie?: string) =>
    (await (await call("GET", `/matches/${id}`, cookie)).json()) as MatchDetailDTO;
  const bell = async (cookie: string) => (await (await call("GET", "/notifications", cookie)).json()) as NotificationsDTO;

  it("needs a majority of the registered players", async () => {
    const { players, m } = await table();
    const [marco, nico, ale] = players;

    expect((await call("POST", `/matches/${m.id}/deletion`, marco!.cookie)).status).toBe(201);
    expect((await call("POST", `/matches/${m.id}/deletion`, nico!.cookie)).status).toBe(409); // one at a time

    let d = await detail(m.id, nico!.cookie);
    expect(d.deletion).toMatchObject({ status: "open", yes: 1, no: 0, eligible: 4, needed: 3, myVote: null, canVote: true });
    expect(d.canProposeDeletion).toBe(false);

    // The others were told, the proposer wasn't.
    expect((await bell(nico!.cookie)).unread).toBe(1);
    expect((await bell(nico!.cookie)).items[0]).toMatchObject({ type: "deletion_proposed", actor: { id: marco!.me.id }, match: { id: m.id } });
    expect((await bell(marco!.cookie)).unread).toBe(0);

    await call("POST", `/matches/${m.id}/deletion/vote`, nico!.cookie, { vote: "yes" });
    expect((await detail(m.id)).voided).toBe(false); // 2 of 3 needed
    const last = await call("POST", `/matches/${m.id}/deletion/vote`, ale!.cookie, { vote: "yes" });
    expect(await last.json()).toEqual({ status: "approved" });

    d = await detail(m.id, marco!.cookie);
    expect(d.voided).toBe(true);
    expect(d.deletion?.status).toBe("approved");
    expect((await bell(marco!.cookie)).items[0]?.type).toBe("match_deleted");
  });

  it("is rejected once yes can no longer win", async () => {
    const { players, m } = await table();
    const [marco, nico, ale] = players;
    await call("POST", `/matches/${m.id}/deletion`, marco!.cookie);
    await call("POST", `/matches/${m.id}/deletion/vote`, nico!.cookie, { vote: "no" });
    expect((await detail(m.id)).deletion?.status).toBe("open"); // 1 yes, 1 no, 2 to vote
    const res = await call("POST", `/matches/${m.id}/deletion/vote`, ale!.cookie, { vote: "no" });
    expect(await res.json()).toEqual({ status: "rejected" });
    expect((await detail(m.id)).voided).toBe(false);
    expect((await bell(marco!.cookie)).items[0]?.type).toBe("deletion_rejected");
    // A new proposal can be made after a rejected one.
    expect((await detail(m.id, nico!.cookie)).canProposeDeletion).toBe(true);
  });

  it("only lets the match's players vote", async () => {
    const { players, m } = await table();
    await call("POST", `/matches/${m.id}/deletion`, players[0]!.cookie);
    const stranger = await login("Intruso");
    expect((await call("POST", `/matches/${m.id}/deletion/vote`, stranger.cookie, { vote: "yes" })).status).toBe(403);
  });

  it("leaves the rating changes of later matches as they were", async () => {
    const { players, m } = await table();
    const later = match(players.map((p) => p.me.id), [setWonBy(1, 31)]);
    await call("POST", "/matches", players[0]!.cookie, later);
    const before = (await detail(later.id)).ratingChanges;

    await call("POST", `/matches/${m.id}/deletion`, players[0]!.cookie);
    await call("POST", `/matches/${m.id}/deletion/vote`, players[1]!.cookie, { vote: "yes" });
    await call("POST", `/matches/${m.id}/deletion/vote`, players[2]!.cookie, { vote: "yes" });
    expect((await detail(m.id)).voided).toBe(true);
    expect((await detail(later.id)).ratingChanges).toEqual(before);
  });

  it("marks notifications read", async () => {
    const { players, m } = await table();
    await call("POST", `/matches/${m.id}/deletion`, players[0]!.cookie);
    const nico = players[1]!;
    const { items } = await bell(nico.cookie);
    await call("POST", "/notifications/read", nico.cookie, { ids: [items[0]!.id] });
    expect((await bell(nico.cookie)).unread).toBe(0);
    expect((await bell(nico.cookie)).items[0]?.read).toBe(true);
  });
});

describe("admins", () => {
  it("can void any match", async () => {
    env.ADMIN_EMAILS = "boss@demo.local, other@example.com";
    const { cookie, me } = await login("Marco");
    const gs = [await guest(cookie, "A"), await guest(cookie, "B"), await guest(cookie, "C")];
    const m = match([me.id, ...gs.map((g) => g.id)], [setWonBy(0, 31)]);
    await call("POST", "/matches", cookie, m);

    const boss = await login("Boss");
    const detail = (await (await call("GET", `/matches/${m.id}`, boss.cookie)).json()) as MatchDetailDTO;
    expect(detail.canAdminVoid).toBe(true);
    expect((await call("POST", `/matches/${m.id}/void`, boss.cookie)).status).toBe(200);
  });
});

describe("guests", () => {
  it("can be claimed with a code from someone who played with them", async () => {
    const marco = await login("Marco");
    const ale = await guest(marco.cookie, "Ale");
    const others = [await guest(marco.cookie, "Bea"), await guest(marco.cookie, "Cico")];
    await call("POST", "/matches", marco.cookie, match([marco.me.id, ale.id, others[0]!.id, others[1]!.id], [setWonBy(1, 31)]));

    const stranger = await login("Intruso");
    expect((await call("POST", `/players/${ale.id}/claim-code`, stranger.cookie)).status).toBe(403);

    const { code } = (await (await call("POST", `/players/${ale.id}/claim-code`, marco.cookie)).json()) as { code: string };
    expect(code).toMatch(/^[A-Z2-9]{6}$/);

    const realAle = await login("Alessandro");
    const claim = await call("POST", "/me/claim", realAle.cookie, { code: code.toLowerCase() });
    expect(claim.status).toBe(200);

    const stats = (await (await call("GET", `/players/${realAle.me.id}/stats`)).json()) as PlayerStatsDTO;
    expect(stats.matchesWon).toBe(1);
    expect((await call("GET", `/players/${ale.id}/stats`)).status).toBe(404);
    // The code is spent with the guest.
    expect((await call("POST", "/me/claim", stranger.cookie, { code })).status).toBe(404);
  });

  it("cannot be claimed by someone who sat at the same table", async () => {
    const marco = await login("Marco");
    const ale = await guest(marco.cookie, "Ale");
    const others = [await guest(marco.cookie, "Bea"), await guest(marco.cookie, "Cico")];
    await call("POST", "/matches", marco.cookie, match([marco.me.id, ale.id, others[0]!.id, others[1]!.id], [setWonBy(1, 31)]));
    const { code } = (await (await call("POST", `/players/${ale.id}/claim-code`, marco.cookie)).json()) as { code: string };
    expect((await call("POST", "/me/claim", marco.cookie, { code })).status).toBe(409);
  });
});

describe("profile", () => {
  it("lets players customise themselves", async () => {
    const { cookie } = await login("Marco");
    const res = await call("PUT", "/me", cookie, { name: "Il Marco", emoji: "🐓", color: "#2f6b4f", motto: "Busso!" });
    expect(res.status).toBe(200);
    expect(((await res.json()) as MeDTO).name).toBe("Il Marco");
    expect((await call("PUT", "/me", cookie, { name: "", emoji: "🐓", color: "red", motto: "" })).status).toBe(400);
  });
});

describe("deleting an account", () => {
  it("wipes personal data but keeps the matches the others played", async () => {
    const marco = await login("Marco");
    const gs = [await guest(marco.cookie, "A"), await guest(marco.cookie, "B"), await guest(marco.cookie, "C")];
    const m = match([marco.me.id, ...gs.map((g) => g.id)], [setWonBy(0, 31)]);
    await call("POST", "/matches", marco.cookie, m);

    expect((await call("DELETE", "/me", marco.cookie)).status).toBe(200);
    expect((await call("GET", "/me", marco.cookie)).status).toBe(401);

    const detail = (await (await call("GET", `/matches/${m.id}`)).json()) as MatchDetailDTO;
    expect(detail.seats[0].deleted).toBe(true);
    expect(detail.seats[0].name).toBe("Deleted player");
    const board = (await (await call("GET", "/leaderboard")).json()) as LeaderboardEntryDTO[];
    expect(board.map((e) => e.player.id)).not.toContain(marco.me.id);
    const players = (await (await call("GET", "/players")).json()) as PlayerDTO[];
    expect(players.map((p) => p.id)).not.toContain(marco.me.id);

    // Signing in again is a fresh start, not the old profile.
    const again = await login("Marco");
    expect(again.me.id).not.toBe(marco.me.id);
  });
});

describe("demo sign-in", () => {
  it("does not exist outside local development", async () => {
    env.ENVIRONMENT = "production";
    expect((await app.request("/auth/dev", {}, env)).status).toBe(404);
  });
});
