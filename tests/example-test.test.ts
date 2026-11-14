import { describe, expect, it } from "vitest";
import { splitForDiscord } from "@/server/digest";
import { armFor, showsExample } from "@/lib/ab";
import { EXAMPLE_LEVELS } from "@/lib/example-board";
import { isHeroId } from "@/lib/heroes";
import { CHAMPION, LORD } from "@/lib/proficiency";

describe("split assignment", () => {
  it("always gives a visitor the same group, and splits about evenly", () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `visitor-${i}-${(i * 7919).toString(36)}`);
    const b = ids.filter((id) => armFor(id, "example") === "b").length;
    expect(b).toBeGreaterThan(900);
    expect(b).toBeLessThan(1100);
    for (const id of ids.slice(0, 50)) expect(armFor(id, "example")).toBe(armFor(id, "example"));
  });

  it("follows the flag: nobody when off, half in the test, everyone when on", () => {
    const ids = Array.from({ length: 200 }, (_, i) => `v-${i}-abcdef`);
    expect(ids.some((id) => showsExample("off", id))).toBe(false);
    expect(ids.every((id) => showsExample("on", id))).toBe(true);
    for (const id of ids) expect(showsExample("test", id)).toBe(armFor(id, "example") === "b");
  });
});

describe("example roster", () => {
  it("uses real heroes and fills every panel", () => {
    const levels = Object.entries(EXAMPLE_LEVELS);
    expect(levels).toHaveLength(20);
    expect(levels.every(([id]) => isHeroId(id))).toBe(true);
    const values = levels.map(([, l]) => l);
    expect(values.some((l) => l >= CHAMPION)).toBe(true);
    expect(values.some((l) => l >= LORD - 2 && l < LORD)).toBe(true);
    expect(values.some((l) => l >= CHAMPION - 5 && l < CHAMPION)).toBe(true);
  });
});

describe("long digests", () => {
  it("split between sections and stay under Discord's limit", () => {
    const section = (n: number) => `**Section ${n}**\n${"x".repeat(700)}`;
    const text = [1, 2, 3, 4].map(section).join("\n\n");
    const parts = splitForDiscord(text);
    expect(parts.length).toBe(2);
    expect(parts.every((p) => p.length <= 1900)).toBe(true);
    expect(parts.join("\n\n")).toBe(text);
    expect(splitForDiscord("short")).toEqual(["short"]);
  });
});
