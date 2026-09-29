import { describe, expect, it } from "vitest";
import { buildProposals, describeDetection, mergeDetections, rankRange } from "@/lib/screenshot-import";
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
      { name: "Thor", level: 21, rank: "Lord" },
      { name: "Hulk", level: null, rank: null },
    ]);
  });
  it("rejects a malformed payload", () => {
    expect(() => parseToolInput({ heroes: "nope" })).toThrow();
  });
});
