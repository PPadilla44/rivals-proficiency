import { describe, expect, it } from "vitest";
import {
  DEFAULT_POINTS_PER_HOUR,
  blendRate,
  estimateLevel,
  hoursToLevel,
  nextMilestone,
  observedRate,
  pointsBetween,
  rankOf,
  tierOf,
} from "@/lib/proficiency";
import { HEROES, heroIdFromName } from "@/lib/heroes";
import { buildRows } from "@/lib/board-model";

describe("ranks", () => {
  it("changes rank every 5 levels with Champion from 50 to 70", () => {
    expect(rankOf(1)).toBe("Agent");
    expect(rankOf(4)).toBe("Agent");
    expect(rankOf(5)).toBe("Knight");
    expect(rankOf(19)).toBe("Centurion");
    expect(rankOf(20)).toBe("Lord");
    expect(rankOf(49)).toBe("Guardian");
    expect(rankOf(50)).toBe("Champion");
    expect(rankOf(70)).toBe("Champion");
    expect(tierOf(999)).toBe(10);
  });

  it("points at the next milestone", () => {
    expect(nextMilestone(12)).toMatchObject({ label: "Lord", to: 20 });
    expect(nextMilestone(20)).toMatchObject({ label: "Champion", to: 50 });
    expect(nextMilestone(55)).toMatchObject({ label: "Max", to: 70 });
  });
});

describe("points", () => {
  it("costs 6,400 points to reach Lord", () => {
    expect(pointsBetween(1, 20)).toBe(4 * 125 + 5 * 240 + 5 * 400 + 5 * 480);
    // Community stage totals: 500, 1,200, 2,000, 2,400, then 8,000 per stage, 62,000 for Champion.
    expect(pointsBetween(1, 50)).toBe(54_100);
    expect(pointsBetween(1, 70)).toBe(116_100);
  });

  it("puts Lord near 20 hours at the default pace", () => {
    const h = hoursToLevel({ level: 1, fraction: 0 }, 20);
    expect(h).toBeGreaterThan(18);
    expect(h).toBeLessThan(22);
  });
});

describe("estimateLevel", () => {
  it("never goes below the level the player set", () => {
    expect(estimateLevel(17, 0).level).toBe(17);
    expect(estimateLevel(17, -500).level).toBe(17);
  });

  it("spends playtime points across level boundaries", () => {
    // 3 hours at 320/h = 960 points. From 18: 480 to 19, 480 to 20.
    const e = estimateLevel(18, 3 * 3600, 320);
    expect(e.level).toBe(20);
    expect(e.gained).toBe(2);
    expect(e.fraction).toBe(0);
  });

  it("caps at 70", () => {
    expect(estimateLevel(69, 1_000 * 3600).level).toBe(70);
  });

  it("reduces hours remaining by partial progress", () => {
    const e = estimateLevel(19, 0.75 * 3600, 320); // 240 of 480 points
    expect(e.level).toBe(19);
    expect(e.fraction).toBeCloseTo(0.5);
    expect(hoursToLevel(e, 20, 320)).toBeCloseTo(0.75);
  });
});

describe("rate learning", () => {
  it("ignores small samples and drops", () => {
    expect(observedRate(10, 12, 20 * 60)).toBeUndefined();
    expect(observedRate(12, 10, 5 * 3600)).toBeUndefined();
  });

  it("learns points per hour from a correction and blends it", () => {
    // 15 to 17 is 960 points over 2 hours = 480/h
    const r = observedRate(15, 17, 2 * 3600)!;
    expect(r).toBe(480);
    expect(blendRate(null, r)).toBe(Math.round(DEFAULT_POINTS_PER_HOUR * 0.6 + 480 * 0.4));
  });
});

describe("heroes", () => {
  it("has 54 unique heroes", () => {
    expect(HEROES).toHaveLength(54);
    expect(new Set(HEROES.map((h) => h.id)).size).toBe(54);
  });

  it("maps API spellings to roster ids", () => {
    expect(heroIdFromName("Bruce Banner")).toBe("hulk");
    expect(heroIdFromName("Punisher")).toBe("the-punisher");
    expect(heroIdFromName("the punisher")).toBe("the-punisher");
    expect(heroIdFromName("Cloak and Dagger")).toBe("cloak-and-dagger");
    expect(heroIdFromName("Cloak & Dagger")).toBe("cloak-and-dagger");
    expect(heroIdFromName("Jubilation Lee")).toBe("jubilee");
    expect(heroIdFromName("SPIDER-MAN")).toBe("spider-man");
    expect(heroIdFromName("Gorr")).toBe("gorr-the-god-butcher");
    expect(heroIdFromName("Nightcrawler")).toBeUndefined();
  });
});

describe("buildRows", () => {
  it("uses the estimate as the effective level only when linked", () => {
    const levels = { thor: { level: 18, baselinePlaytimeSec: 1000 } };
    const playtime = { thor: 1000 + 3 * 3600 };
    const linked = buildRows(levels, playtime, { linked: true, pointsPerHour: 320 }).find((r) => r.id === "thor")!;
    expect(linked.level).toBe(18);
    expect(linked.effective).toBe(20);
    expect(linked.hoursToNext).toBeGreaterThan(0);

    const guest = buildRows(levels, playtime, { linked: false, pointsPerHour: null }).find((r) => r.id === "thor")!;
    expect(guest.effective).toBe(18);
    expect(guest.estimate).toBeNull();
    expect(guest.hoursToNext).toBeNull();
  });
});

describe("rank levels", () => {
  it("starts a rank every 5 levels and ends Champion at 70", async () => {
    const { rankLevels } = await import("@/lib/proficiency");
    expect(rankLevels(0)).toEqual([1, 4]);
    expect(rankLevels(4)).toEqual([20, 24]);
    expect(rankLevels(9)).toEqual([45, 49]);
    expect(rankLevels(10)).toEqual([50, 70]);
  });
});
