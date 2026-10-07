import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/server/board";
import { recordEvent } from "@/server/events";
import { exampleTestLines, getExampleTest, splitForDiscord } from "@/server/digest";
import { armFor, showsExample } from "@/lib/ab";
import { EXAMPLE_LEVELS } from "@/lib/example-board";
import { isHeroId } from "@/lib/heroes";
import { CHAMPION, LORD } from "@/lib/proficiency";

let db: AnyDb;
beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  await pg.insert(schema.users).values({ id: "u1", name: "Tester" });
  db = pg as unknown as AnyDb;
});

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

describe("example board test results", () => {
  const t0 = new Date("2026-10-07T20:00:00Z");
  const at = (h: number) => new Date(t0.getTime() + h * 3_600_000);
  const join = (visitorId: string, arm: "a" | "b", h = 0) =>
    recordEvent(db, { name: "ab", visitorId, props: { exp: "example", arm }, at: at(h) });

  it("is empty before anyone is assigned", async () => {
    expect(await getExampleTest(db, at(1))).toBeNull();
  });

  it("keeps the first group a browser was given", async () => {
    expect(await join("test-visitor-x1", "a")).toBe(true);
    expect(await join("test-visitor-x1", "b", 1)).toBe(false);
    const t = await getExampleTest(db, at(2));
    expect(t?.arms.map((a) => a.visitors)).toEqual([1, 0]);
  });

  it("counts what each half went on to do", async () => {
    // Empty board half: one looks and leaves, one taps once.
    await join("test-visitor-a1", "a");
    await join("test-visitor-a2", "a");
    await recordEvent(db, { name: "level_set", visitorId: "test-visitor-a2", props: { heroes: 1, taps: 1 }, at: at(0.1) });
    // Example half: one leaves, one starts and builds a board and signs in, one starts only, one returns next day.
    await join("test-visitor-b1", "b");
    await join("test-visitor-b2", "b");
    await recordEvent(db, { name: "example_start", visitorId: "test-visitor-b2", props: { via: "button" }, at: at(0.1) });
    await recordEvent(db, { name: "level_set", visitorId: "test-visitor-b2", props: { heroes: 14, taps: 20 }, at: at(0.2) });
    await recordEvent(db, { name: "identify", visitorId: "test-visitor-b2", userId: "u1", at: at(0.3) });
    await join("test-visitor-b3", "b");
    await recordEvent(db, { name: "example_start", visitorId: "test-visitor-b3", props: { via: "tap" }, at: at(0.1) });
    await join("test-visitor-b4", "b");
    await recordEvent(db, { name: "visit", visitorId: "test-visitor-b4", at: at(30) });
    // Activity from before joining the test does not count.
    await recordEvent(db, { name: "level_set", visitorId: "test-visitor-a1", props: { heroes: 30, taps: 30 }, at: at(-5) });

    const now = at(40);
    const t = await getExampleTest(db, now);
    expect(t?.arms).toEqual([
      { arm: "a", visitors: 2, started: 1, built: 0, signedIn: 0, returned: 0, leftExample: 0 },
      { arm: "b", visitors: 4, started: 1, built: 1, signedIn: 1, returned: 1, leftExample: 2 },
    ]);
    expect(exampleTestLines(t!, now)).toEqual([
      "**Example board test** · day 2 · empty board vs example board",
      "New visitors 2 vs 4",
      "Started their board 1 (50%) vs 1 (25%)",
      "Updated 10+ heroes 0 (0%) vs 1 (25%)",
      "Signed in 0 vs 1 · came back 0 vs 1",
      "Left the example to start: 2 (50%) of the example group",
      "Too early to judge: wait for 100 visitors in each group.",
    ]);
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
