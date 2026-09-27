import { describe, expect, it } from "vitest";
import { RivalsApiError, parsePlayerStats } from "@/lib/rivals-api";

// Shape follows the documented /api/v1/player/{query} response.
const sample = {
  uid: 123456789,
  name: "SomePlayer",
  isPrivate: false,
  player: { uid: 123456789, name: "SomePlayer", isPrivate: false },
  heroes_ranked: [
    { hero_id: 1011, hero_name: "Bruce Banner", play_time: 3600, matches: 6 },
    { hero_id: 1039, hero_name: "Thor", play_time: 7200.4, matches: 12 },
    { hero_id: 9999, hero_name: "Nightcrawler", play_time: 60 },
  ],
  heroes_unranked: [
    { hero_id: 1039, hero_name: "thor", play_time: 1800 },
    "unexpected string entry",
  ],
};

describe("parsePlayerStats", () => {
  it("sums ranked and unranked playtime per hero", () => {
    const s = parsePlayerStats(sample, "fallback");
    expect(s.uid).toBe("123456789");
    expect(s.name).toBe("SomePlayer");
    const byId = Object.fromEntries(s.heroes.map((h) => [h.heroId, h.playtimeSec]));
    expect(byId.hulk).toBe(3600);
    expect(byId.thor).toBe(9000);
    expect(s.unmatched).toEqual(["Nightcrawler"]);
  });

  it("explains private profiles", () => {
    expect(() => parsePlayerStats({ isPrivate: true, heroes_ranked: [] }, "1")).toThrow(RivalsApiError);
  });

  it("tolerates missing lists", () => {
    const s = parsePlayerStats({ uid: "5" }, "5");
    expect(s.heroes).toEqual([]);
  });
});
