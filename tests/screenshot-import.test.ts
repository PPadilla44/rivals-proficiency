import { describe, expect, it } from "vitest";
import {
  buildProposals,
  describeDetection,
  looksLikeSingleHeroPages,
  mergeDetections,
  rankRange,
  tileRects,
} from "@/lib/screenshot-import";
import { parseToolInput } from "@/lib/vision";

describe("rank ranges", () => {
  it("maps ranks to levels", () => {
    expect(rankRange("Agent")).toEqual([1, 4]);
    expect(rankRange("lord")).toEqual([20, 24]);
    expect(rankRange("Guardian")).toEqual([45, 49]);
    expect(rankRange("Champion")).toEqual([50, 70]);
    expect(rankRange("Emperor")).toBeNull();
  });
});

describe("merging detections", () => {
  it("matches names, keeps the best reading per hero, and reports unknown names", () => {
    const { byHero, unmatched } = mergeDetections([
      [
        { name: "Thor", level: 22, rank: "Lord" },
        { name: "Bruce Banner", level: null, rank: "Knight" },
        { name: "Mystery Man", level: 9, rank: null },
      ],
      [
        { name: "THOR", level: 24, rank: null },
        { name: "Cloak & Dagger", level: null, rank: "Champion" },
        { name: "Hulk", level: 7, rank: null },
        { name: "Storm", level: null, rank: null },
      ],
    ]);
    expect(byHero.get("thor")?.level).toBe(24);
    expect(byHero.get("hulk")?.level).toBe(7);
    expect(byHero.get("cloak-and-dagger")?.rank).toBe("Champion");
    expect(byHero.has("storm")).toBe(false);
    expect(unmatched).toEqual(["Mystery Man"]);
  });

  it("clamps impossible levels", () => {
    const { byHero } = mergeDetections([[{ name: "Thor", level: 99, rank: null }]]);
    expect(byHero.get("thor")?.level).toBe(70);
  });
});

describe("proposals", () => {
  const { byHero } = mergeDetections([
    [
      { name: "Thor", level: 23, rank: null },
      { name: "Hulk", level: null, rank: "Lord" },
      { name: "Storm", level: null, rank: "Lord" },
      { name: "Loki", level: 10, rank: null },
      { name: "Groot", level: 5, rank: null },
      { name: "Magik", level: null, rank: "Captain" },
    ],
  ]);
  const ps = buildProposals(byHero, { thor: 18, hulk: 22, storm: 12, loki: 14, groot: 5 });
  const by = Object.fromEntries(ps.map((p) => [p.heroId, p]));

  it("takes exact levels", () => {
    expect(by.thor).toMatchObject({ proposed: 23, status: "raise", selected: true });
    expect(by.groot).toMatchObject({ proposed: 5, status: "same", selected: false });
  });

  it("keeps a current level inside the rank and raises one below it", () => {
    expect(by.hulk).toMatchObject({ proposed: 22, status: "same" });
    expect(by.storm).toMatchObject({ proposed: 20, status: "raise", selected: true });
    expect(by.magik).toMatchObject({ proposed: 10, status: "new", selected: true });
  });

  it("treats an unset hero read at level 1 as unchanged", () => {
    const { byHero } = mergeDetections([[{ name: "Venom", level: null, rank: "Agent" }, { name: "Blade", level: null, rank: "Knight" }]]);
    const ps = buildProposals(byHero, {});
    expect(ps.find((p) => p.heroId === "venom")).toMatchObject({ proposed: 1, status: "same", selected: false });
    expect(ps.find((p) => p.heroId === "blade")).toMatchObject({ proposed: 5, status: "new", selected: true });
  });

  it("never pre-selects lowering a level", () => {
    expect(by.loki).toMatchObject({ proposed: 10, status: "lower", selected: false });
  });

  it("orders changes first and describes readings", () => {
    expect(ps.map((p) => p.status)).toEqual(["new", "raise", "raise", "lower", "same", "same"]);
  });
  it("describes readings", () => {
    expect(describeDetection(by.thor)).toBe("Lv 23 (Lord)");
    expect(describeDetection(by.storm)).toBe("Lord (Lv 20 to 24)");
  });
});

describe("vision tool output", () => {
  it("parses and tolerates junk fields", () => {
    const r = parseToolInput({
      is_proficiency_screen: true,
      heroes: [
        { name: "Thor", level: 21, rank: "Lord" },
        { name: "Hulk", level: "twelve", rank: 5 },
      ],
    });
    expect(r.isProficiencyScreen).toBe(true);
    expect(r.heroes).toEqual([
      { name: "Thor", level: 21, rank: "Lord", badge: undefined },
      { name: "Hulk", level: null, rank: null, badge: undefined },
    ]);
  });
  it("unwraps fields sent as JSON strings", () => {
    const r = parseToolInput({ is_proficiency_screen: "true", heroes: JSON.stringify([{ name: "Thor", level: null, rank: "Lord" }]) });
    expect(r.isProficiencyScreen).toBe(true);
    expect(r.heroes[0]).toMatchObject({ name: "Thor", rank: "Lord" });
  });
  it("rejects a malformed payload", () => {
    expect(() => parseToolInput({ heroes: "nope" })).toThrow();
  });
});

describe("tiling", () => {
  it("keeps small screenshots whole", () => {
    expect(tileRects(1600, 900)).toEqual([{ x: 0, y: 0, w: 1600, h: 900 }]);
  });
  it("covers a wide screenshot with four overlapping tiles", () => {
    const t = tileRects(2560, 1440);
    expect(t).toHaveLength(4);
    expect(t[0]).toEqual({ x: 0, y: 0, w: 1382, h: 778 });
    expect(t[3]).toEqual({ x: 1178, y: 662, w: 1382, h: 778 });
    for (const r of t) {
      expect(r.x + r.w).toBeLessThanOrEqual(2560);
      expect(r.y + r.h).toBeLessThanOrEqual(1440);
    }
  });
  it("stacks tall phone screenshots", () => {
    const t = tileRects(1290, 2796);
    expect(t).toHaveLength(3);
    expect(t[2].y + t[2].h).toBe(2796);
  });
});

describe("wrong screen detection", () => {
  const d = (name: string) => ({ name, level: null, rank: "Lord" });
  it("flags pictures that each show one or two heroes", () => {
    expect(looksLikeSingleHeroPages([[d("Hela")]])).toBe(true);
    expect(looksLikeSingleHeroPages([[d("Hela")], [d("Thor"), d("Loki")]])).toBe(true);
  });
  it("does not flag a Heroes tab page, or nothing at all", () => {
    const page = ["Hela", "Thor", "Loki", "Storm", "Magik"].map(d);
    expect(looksLikeSingleHeroPages([page])).toBe(false);
    expect(looksLikeSingleHeroPages([page, [d("Namor")]])).toBe(false);
    expect(looksLikeSingleHeroPages([])).toBe(false);
  });
});
