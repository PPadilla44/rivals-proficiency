import { describe, expect, it } from "vitest";
import { buildRows, type LevelEntry } from "@/lib/board-model";
import {
  PICK_MAX,
  PICK_MIN,
  cardData,
  defaultPicks,
  levelText,
  pickLocked,
  rowBoxes,
  shareCandidates,
  shareEligible,
  togglePick,
} from "@/lib/share-card";
import { EXAMPLE_BOARD } from "@/lib/example-board";

const board = (levels: Record<string, number | [number, boolean]>) =>
  buildRows(
    Object.fromEntries(
      Object.entries(levels).map(([id, v]): [string, LevelEntry] => {
        const [level, approx] = Array.isArray(v) ? v : [v, false];
        return [id, { level, baselinePlaytimeSec: null, approx }];
      }),
    ),
    {},
    { linked: false, pointsPerHour: null },
  );

describe("who gets the Share button", () => {
  it("needs three heroes at Lord or higher", () => {
    expect(shareEligible(board({ hela: 50, thor: 20 }))).toBe(false);
    expect(shareEligible(board({ hela: 50, thor: 20, groot: 19 }))).toBe(false);
    expect(shareEligible(board({ hela: 50, thor: 20, groot: 20 }))).toBe(true);
  });
});

describe("picking heroes", () => {
  const rows = board({ hela: 50, "luna-snow": 47, "doctor-strange": 41, "invisible-woman": 33, "cloak-and-dagger": 28, thor: 9, groot: 1 });

  it("offers heroes with a level set, highest first, and ticks the top five", () => {
    const c = shareCandidates(rows).map((r) => r.id);
    expect(c).toEqual(["hela", "luna-snow", "doctor-strange", "invisible-woman", "cloak-and-dagger", "thor"]);
    expect(defaultPicks(rows)).toEqual(c.slice(0, 5));
  });

  it("keeps three to five picked", () => {
    let p = defaultPicks(rows);
    expect(togglePick(p, "thor")).toBe(p); // full at five
    expect(pickLocked(p, "thor")).toBe(true);
    p = togglePick(p, "hela");
    p = togglePick(p, "luna-snow");
    expect(p).toHaveLength(PICK_MIN);
    expect(togglePick(p, "doctor-strange")).toBe(p); // can't go below three
    expect(pickLocked(p, "doctor-strange")).toBe(true);
    expect(togglePick(p, "thor")).toHaveLength(4);
    expect(PICK_MAX).toBe(5);
  });
});

describe("what the card shows", () => {
  it("orders picked heroes by level and counts the whole board", () => {
    const rows = board({ hela: 50, "luna-snow": 47, thor: 22, groot: 20, hulk: 5 });
    const d = cardData(rows, ["groot", "hela", "hulk"], new Date("2026-11-03T12:00:00Z"));
    expect(d.heroes.map((h) => [h.name, h.level, h.rank])).toEqual([
      ["Hela", 50, "Champion"],
      ["Groot", 20, "Lord"],
      ["Hulk", 5, "Knight"],
    ]);
    expect([d.lordPlus, d.champions, d.tracked]).toEqual([4, 1, 5]);
    expect(d.stamp).toMatch(/^Season [\d.]+ · Nov 2026$/);
  });

  it("marks a rank-only level from a screenshot as 20+", () => {
    const rows = board({ hela: [20, true], thor: 21, groot: 22 });
    const [h] = cardData(rows, ["hela"]).heroes;
    expect(levelText(h)).toBe("20+");
  });

  it("never offers the sample board's heroes as the player's own", () => {
    // The sample board is eligible on its own data, so Board must hide the button while it shows.
    const sample = buildRows(EXAMPLE_BOARD.levels, {}, { linked: false, pointsPerHour: null });
    expect(shareEligible(sample)).toBe(true);
  });
});

describe("card layout", () => {
  it("fits every row between the header and the footer, larger when fewer", () => {
    for (const n of [3, 4, 5]) {
      const boxes = rowBoxes(n);
      expect(boxes).toHaveLength(n);
      expect(boxes[0].y).toBeGreaterThanOrEqual(288);
      const last = boxes[n - 1];
      expect(last.y + last.h).toBeLessThanOrEqual(950);
      for (let i = 1; i < n; i++) expect(boxes[i].y).toBeGreaterThan(boxes[i - 1].y + boxes[i - 1].h);
      expect(boxes[0].portrait).toBeLessThan(boxes[0].h);
    }
    expect(rowBoxes(3)[0].h).toBeGreaterThan(rowBoxes(5)[0].h);
    expect(rowBoxes(3)[0].name).toBeGreaterThan(rowBoxes(5)[0].name);
  });
});
