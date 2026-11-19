import { describe, expect, it } from "vitest";
import { CALC_NOTICE_MAX_AGE_MS, addHeroIfMissing, parseCalcNotice, validAdd } from "@/lib/guest-board";

const stored = (levels: Record<string, unknown>) => JSON.stringify({ levels });

describe("adding a hero to a guest's saved levels", () => {
  it("starts a board when nothing is saved", () => {
    const out = addHeroIfMissing(null, "hulk", 17);
    expect(out.result).toBe("added");
    expect(JSON.parse(out.next!)).toEqual({ levels: { hulk: 17 } });
    expect(addHeroIfMissing("", "hulk", 17).result).toBe("added");
  });

  it("keeps every other hero exactly as it was", () => {
    const out = addHeroIfMissing(stored({ thor: 22, storm: 3 }), "hulk", 17);
    expect(out.result).toBe("added");
    expect(JSON.parse(out.next!)).toEqual({ levels: { thor: 22, storm: 3, hulk: 17 } });
  });

  it("never overwrites a hero that is already set, and says what it was", () => {
    const out = addHeroIfMissing(stored({ hulk: 12 }), "hulk", 17);
    expect(out).toEqual({ result: "exists", next: null, existing: 12 });
    // Even a level 1 entry counts as set.
    expect(addHeroIfMissing(stored({ hulk: 1 }), "hulk", 17).result).toBe("exists");
  });

  it("leaves data it does not understand alone", () => {
    for (const raw of ["not json", "null", "5", "[]", stored({}).replace("{}", "5"), JSON.stringify({ levels: [1] }), JSON.stringify({ levels: null }), JSON.stringify({ other: 1 })]) {
      expect(addHeroIfMissing(raw, "hulk", 17), raw).toEqual({ result: "bad", next: null });
    }
    // Any value that is not a plain number makes the whole thing off limits.
    expect(addHeroIfMissing(stored({ thor: { level: 22 } }), "hulk", 17).result).toBe("bad");
    expect(addHeroIfMissing(stored({ thor: "22" }), "hulk", 17).result).toBe("bad");
    expect(addHeroIfMissing(stored({ thor: null }), "hulk", 17).result).toBe("bad");
  });

  it("only carries a known hero at a whole level from 2 up to the max", () => {
    expect(validAdd("hulk", 2)).toBe(true);
    expect(validAdd("hulk", 70)).toBe(true);
    for (const [h, l] of [["hulk", 1], ["hulk", 0], ["hulk", 71], ["hulk", 17.5], ["hulk", NaN], ["nobody", 17], ["__proto__", 17], [5, 17], ["hulk", "17"]] as const) {
      expect(validAdd(h, l), `${h} ${l}`).toBe(false);
      expect(addHeroIfMissing(null, h as string, l as number).result).toBe("bad");
    }
  });

  it("does not treat inherited names as saved heroes", () => {
    expect(addHeroIfMissing(stored({}), "hulk", 17).result).toBe("added");
  });
});

describe("the calculator's note to the board", () => {
  const now = 1_000_000;
  const note = (n: object) => JSON.stringify(n);

  it("reads a fresh add note", () => {
    expect(parseCalcNotice(note({ via: "add", hero: "hulk", level: 17, result: "added", at: now - 1000 }), now)).toEqual({
      via: "add",
      hero: "hulk",
      level: 17,
      result: "added",
      existing: undefined,
      at: now - 1000,
    });
    expect(parseCalcNotice(note({ via: "add", hero: "hulk", level: 17, result: "exists", existing: 12, at: now }), now)?.existing).toBe(12);
    expect(parseCalcNotice(note({ via: "open", at: now - 5 }), now)).toEqual({ via: "open", at: now - 5 });
  });

  it("ignores a stale note, one from the future and anything malformed", () => {
    expect(parseCalcNotice(note({ via: "open", at: now - CALC_NOTICE_MAX_AGE_MS - 1 }), now)).toBeNull();
    expect(parseCalcNotice(note({ via: "open", at: now + 5000 }), now)).toBeNull();
    expect(parseCalcNotice(null, now)).toBeNull();
    expect(parseCalcNotice("nope", now)).toBeNull();
    expect(parseCalcNotice("5", now)).toBeNull();
    expect(parseCalcNotice(note({ via: "sneak", at: now }), now)).toBeNull();
    expect(parseCalcNotice(note({ via: "add", hero: "nobody", level: 17, result: "added", at: now }), now)).toBeNull();
    expect(parseCalcNotice(note({ via: "add", hero: "hulk", level: 1, result: "added", at: now }), now)).toBeNull();
    expect(parseCalcNotice(note({ via: "add", hero: "hulk", level: 17, result: "hacked", at: now }), now)).toBeNull();
    expect(parseCalcNotice(note({ via: "add", hero: "hulk", level: 17, at: now }), now)).toBeNull();
  });
});
