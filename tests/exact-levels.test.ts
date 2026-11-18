import { describe, expect, it } from "vitest";
import { buildRows, closestContenders, exactChoices, type LevelEntry } from "@/lib/board-model";

const entry = (level: number, approx = false): LevelEntry => ({ level, baselinePlaytimeSec: null, approx });
const rowsFor = (levels: Record<string, LevelEntry>) => buildRows(levels, {}, { linked: false, pointsPerHour: null });

describe("closestContenders", () => {
  it("lists rank-only heroes whose rank reaches higher than the leader", () => {
    // Thor, Hulk and Storm are all Centurion (15 to 19) read from a screenshot; Groot is a Knight (5 to 9).
    const c = closestContenders(rowsFor({ thor: entry(15, true), hulk: entry(15, true), storm: entry(15, true), groot: entry(5, true) }))!;
    expect(c.target).toBe(20);
    expect(c.leader).toBe(15);
    expect(c.rows.map((r) => r.id).sort()).toEqual(["hulk", "storm", "thor"]);
    expect(c.more).toBe(0);
  });

  it("returns nothing when the leader is exact and no rank-only hero can beat it", () => {
    // Thor is exactly 19, the top of Centurion: a rank-only Centurion could at most tie.
    expect(closestContenders(rowsFor({ thor: entry(19), hulk: entry(15, true) }))).toBeNull();
  });

  it("keeps a rank-only hero that could pass an exact leader", () => {
    const c = closestContenders(rowsFor({ thor: entry(16), hulk: entry(15, true) }))!;
    expect(c.rows.map((r) => r.id)).toEqual(["hulk"]);
    expect(c.leader).toBe(16);
  });

  it("leaves out heroes the player typed, at level 1, or already at the target", () => {
    const c = closestContenders(rowsFor({ thor: entry(15, true), hulk: entry(15), storm: entry(1), loki: entry(20, true) }))!;
    expect(c.rows.map((r) => r.id)).toEqual(["thor"]);
  });

  it("chases Champion once every started hero is at Lord or higher", () => {
    // Thor is a Guardian (45 to 49) from a screenshot; Hulk is Lord (20 to 24) from a screenshot.
    const c = closestContenders(rowsFor({ thor: entry(45, true), hulk: entry(20, true), storm: entry(60, true) }))!;
    expect(c.target).toBe(50);
    expect(c.leader).toBe(45);
    expect(c.rows.map((r) => r.id)).toEqual(["thor"]);
  });

  it("lists at most five and counts the rest", () => {
    const ids = ["thor", "hulk", "storm", "loki", "magneto", "venom", "groot"];
    const c = closestContenders(rowsFor(Object.fromEntries(ids.map((id) => [id, entry(15, true)]))))!;
    expect(c.rows).toHaveLength(5);
    expect(c.more).toBe(2);
  });

  it("returns null when nothing is started", () => {
    expect(closestContenders(rowsFor({}))).toBeNull();
  });
});

describe("exactChoices", () => {
  it("offers the levels of the hero's rank, never reaching the target", () => {
    const rows = rowsFor({ thor: entry(15, true), groot: entry(5, true), hulk: entry(45, true) });
    const get = (id: string) => rows.find((r) => r.id === id)!;
    expect(exactChoices(get("thor"), 20)).toEqual([15, 16, 17, 18, 19]);
    expect(exactChoices(get("groot"), 20)).toEqual([5, 6, 7, 8, 9]);
    expect(exactChoices(get("hulk"), 50)).toEqual([45, 46, 47, 48, 49]);
  });
});
