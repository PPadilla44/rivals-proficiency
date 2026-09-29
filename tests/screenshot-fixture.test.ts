import { describe, expect, it } from "vitest";
import expected from "./fixtures/heroes-tab/expected.json";
import { HEROES, heroIdFromName } from "@/lib/heroes";
import { RANKS } from "@/lib/proficiency";

describe("Heroes tab fixture", () => {
  it("names every hero exactly once with a real rank", () => {
    const ids = Object.entries(expected).flatMap(([rank, names]) => {
      expect(RANKS).toContain(rank);
      return names.map((n) => heroIdFromName(n));
    });
    expect(ids).not.toContain(undefined);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(HEROES.length);
  });
});
