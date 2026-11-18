import { describe, expect, it } from "vitest";
import { boardOg } from "@/lib/board-og";
import { shareMessage } from "@/lib/share-card";
import { existsSync } from "node:fs";
import { HEROES } from "@/lib/heroes";
import { RANKS } from "@/lib/proficiency";

describe("board preview data", () => {
  it("uses the name, or A player", () => {
    expect(boardOg("Pablo", {}).title).toBe("Pablo's board");
    expect(boardOg(null, {}).title).toBe("A player's board");
  });
  it("says so when nothing is set", () => {
    const og = boardOg(null, { hela: 1 });
    expect(og.summary).toBe("No heroes set yet");
    expect(og.heroes).toEqual([]);
  });
  it("shows the top four heroes by level and counts Lord and Champion", () => {
    const og = boardOg("X", { hela: 55, "luna-snow": 47, "doctor-strange": 40, magneto: 35, groot: 22, hulk: 3 });
    expect(og.heroes.map((h) => h.id)).toEqual(["hela", "luna-snow", "doctor-strange", "magneto"]);
    expect(og.heroes[0]).toMatchObject({ level: 55, rank: "Champion", tier: 10 });
    expect(og.summary).toBe("6 heroes set · 5 at Lord or higher · 1 at Champion");
  });
  it("marks rank-only heroes so the preview can show 15+", () => {
    const og = boardOg("X", { thor: 15, hulk: 9 }, ["thor"]);
    expect(og.heroes.map((h) => [h.id, h.approx])).toEqual([["thor", true], ["hulk", false]]);
    expect(boardOg("X", { thor: 15 }).heroes[0].approx).toBe(false);
  });
  it("has a picture for every hero and rank", () => {
    for (const h of HEROES) expect(existsSync(`src/og/heroes/${h.id}.png`), h.id).toBe(true);
    for (const r of RANKS) expect(existsSync(`src/og/ranks/${r.toLowerCase()}.png`), r).toBe(true);
  });
});

describe("share message", () => {
  it("adds the board link only when there is one", () => {
    expect(shareMessage(null)).toBe("rivalsproficiency.com");
    expect(shareMessage("https://rivalsproficiency.com/b/abc23xyz")).toBe("My Marvel Rivals board: https://rivalsproficiency.com/b/abc23xyz");
  });
});
