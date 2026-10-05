import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import { SERVER_VISITOR, cleanProps, getStats, recordEvent } from "@/server/events";
import { deleteAccount, type AnyDb } from "@/server/board";

let db: AnyDb;
const V1 = "visitor-aaaa-1111";
const V2 = "visitor-bbbb-2222";
const day = (d: number, h = 12) => new Date(Date.UTC(2026, 9, d, h));

beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  await pg.insert(schema.users).values({ id: "u1", name: "Tester" });
  db = pg as unknown as AnyDb;
});

describe("events", () => {
  it("drops unknown names, bad visitor ids and junk props", async () => {
    expect(await recordEvent(db, { name: "hack", visitorId: V1 })).toBe(false);
    expect(await recordEvent(db, { name: "visit", visitorId: "x" })).toBe(false);
    expect(cleanProps({ mode: "guest", "Bad-Key": 1, nested: { a: 1 }, n: 3, long: "x".repeat(99) })).toEqual({
      mode: "guest",
      n: 3,
      long: "x".repeat(40),
    });
  });

  it("counts visitors, interaction, returning visitors and imports", async () => {
    await recordEvent(db, { name: "visit", visitorId: V1, props: { mode: "guest" }, at: day(1) });
    await recordEvent(db, { name: "level_set", visitorId: V1, props: { heroes: 3 }, at: day(1) });
    await recordEvent(db, { name: "visit", visitorId: V1, props: { mode: "guest" }, at: day(2) });
    await recordEvent(db, { name: "visit", visitorId: V2, userId: "u1", props: { mode: "user" }, at: day(2) });
    await recordEvent(db, { name: "import_read", visitorId: V2, userId: "u1", props: { screenshots: 4 }, at: day(2) });
    await recordEvent(db, { name: "import_save", visitorId: V2, userId: "u1", props: { heroes: 29 }, at: day(2) });
    await recordEvent(db, { name: "sign_in", visitorId: SERVER_VISITOR, userId: "u1", props: { new_user: true }, at: day(2) });

    const s = await getStats(db, 7, day(3));
    expect(s).toMatchObject({
      visitors: 2,
      interacted: 2,
      signedInVisitors: 1,
      returning: 1,
      signIns: 1,
      newAccounts: 1,
      levelSets: 3,
      importsSaved: 1,
      screenshotsRead: 4,
    });
    expect(s.daily.map((d) => d.day)).toEqual(["2026-10-02", "2026-10-01"]);
    expect(s.daily[1]).toMatchObject({ visitors: 1, interacted: 1, levelSets: 3 });
  });

  it("deleting an account removes its events", async () => {
    await recordEvent(db, { name: "visit", visitorId: V2, userId: "u1" });
    await recordEvent(db, { name: "visit", visitorId: V1 });
    await deleteAccount(db, "u1");
    const s = await getStats(db, 7);
    expect(s.visitors).toBe(1);
  });

  it("records one identify per browser and account, and only when signed in", async () => {
    const V9 = "visitor-identify-9";
    expect(await recordEvent(db, { name: "identify", visitorId: V9 })).toBe(false);
    expect(await recordEvent(db, { name: "identify", visitorId: V9, userId: "u1" })).toBe(true);
    expect(await recordEvent(db, { name: "identify", visitorId: V9, userId: "u1" })).toBe(false);
  });

  it("splits visitors and interaction by device", async () => {
    const at = new Date("2026-03-01T12:00:00Z");
    const now = new Date("2026-03-02T00:00:00Z");
    await recordEvent(db, { name: "visit", visitorId: "device-phone-1", props: { device: "mobile" }, at });
    await recordEvent(db, { name: "visit", visitorId: "device-phone-2", props: { device: "mobile" }, at });
    await recordEvent(db, { name: "level_set", visitorId: "device-phone-2", props: { heroes: 4, device: "mobile" }, at });
    await recordEvent(db, { name: "visit", visitorId: "device-desk-1", props: { device: "desktop" }, at });
    await recordEvent(db, { name: "visit", visitorId: "device-none-1", props: { mode: "guest" }, at });
    const s = await getStats(db, 1, now);
    expect(s.devices).toEqual([
      { device: "desktop", visitors: 1, interacted: 0, signedIn: 0, levelSets: 0 },
      { device: "mobile", visitors: 2, interacted: 1, signedIn: 0, levelSets: 4 },
    ]);
  });

  it("counts heroes updated separately from button taps", async () => {
    const at = new Date("2026-04-01T12:00:00Z");
    const now = new Date("2026-04-02T00:00:00Z");
    await recordEvent(db, { name: "level_set", visitorId: "taps-visitor-1", props: { heroes: 3, taps: 40 }, at });
    await recordEvent(db, { name: "level_set", visitorId: "taps-visitor-2", props: { heroes: 5 }, at });
    const s = await getStats(db, 1, now);
    expect(s.levelSets).toBe(8);
    expect(s.levelTaps).toBe(45);
  });
});
