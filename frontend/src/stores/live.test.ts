import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { PlayerDTO } from "@maraffometro/shared";
import { useLiveMatch } from "./live";

const p = (id: string): PlayerDTO => ({ id, name: id, emoji: "🃏", color: "#000000", motto: "", isGuest: false });
const seats = [p("a1"), p("b1"), p("a2"), p("b2")] as [PlayerDTO, PlayerDTO, PlayerDTO, PlayerDTO];

describe("the live match", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("asks who holds the four of denari before the first hand", () => {
    const live = useLiveMatch();
    live.start(seats, 31);
    expect(live.state!.awaitingFirstMano).toBe(true);
    live.addHand(6);
    expect(live.handCount).toBe(0); // refused until asked

    live.setMano(2);
    live.addHand(11); // a2 leads: team A di mano, takes 11
    expect(live.currentResult!.score).toEqual([11, 0]);
    expect(live.state!.manoSeat).toBe(3);

    live.addHand(0); // b2 leads, B takes 0 → A 22
    live.addHand(11, true); // a1 leads, A 11 + maraffa → 36
    expect(live.setOver).toBe(true);

    // 1–0: the second set carries on the rotation from the next player.
    live.nextSet(41);
    expect(live.state!.awaitingFirstMano).toBe(false);
    expect(live.state!.manoSeat).toBe(1);
  });

  it("asks again for a tie-break", () => {
    const live = useLiveMatch();
    live.start(seats, 31);
    live.setMano(0);
    for (const n of [11, 0, 11]) live.addHand(n); // A wins
    live.nextSet(31);
    for (const n of [11, 0, 11]) live.addHand(n); // seats 3, 0, 1 lead: B takes 11 each
    expect(live.matchResult!.setsWon).toEqual([1, 1]);
    live.nextSet(41);
    expect(live.state!.awaitingFirstMano).toBe(true);
  });

  it("steps back through hands and out of an unplayed set", () => {
    const live = useLiveMatch();
    live.start(seats, 31);
    live.setMano(0);
    live.addHand(11);
    live.addHand(0);
    live.addHand(11);
    expect(live.setOver).toBe(true);
    live.nextSet(41);

    live.undo(); // out of the new set, back to the end of the first
    expect(live.state!.sets).toHaveLength(1);
    expect(live.setOver).toBe(true);

    live.undo(); // the winning hand
    expect(live.setOver).toBe(false);
    expect(live.state!.manoSeat).toBe(2);
    expect(live.state!.awaitingFirstMano).toBe(false);
  });

  it("submits only the sets that were played", () => {
    const live = useLiveMatch();
    live.start(seats, 31);
    live.setMano(1);
    live.addHand(5);
    const sub = live.toSubmission()!;
    expect(sub.seats).toEqual(["a1", "b1", "a2", "b2"]);
    expect(sub.sets).toEqual([{ target: 31, hands: [{ manoSeat: 1, points: [6, 5], maraffa: false }] }]);
  });

  it("survives a reload", () => {
    const live = useLiveMatch();
    live.start(seats, 51);
    live.setMano(3);
    live.addHand(7, true);
    return Promise.resolve().then(() => {
      setActivePinia(createPinia());
      const again = useLiveMatch();
      expect(again.state?.sets[0]?.hands).toHaveLength(1);
      expect(again.state?.manoSeat).toBe(0);
    });
  });
});
