import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { applySync, deleteAccount, getBoard, linkPlayer, setLevels, takeScanSlot, unlinkPlayer, type AnyDb } from "@/server/board";

let db: AnyDb;
const USER = "u1";

beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  await pg.insert(schema.users).values({ id: USER, name: "Tester" });
  db = pg as unknown as AnyDb;
});

const stats = (thor: number, hulk?: number) => ({
  uid: "42",
  name: "Tester",
  unmatched: [],
  heroes: [{ heroId: "thor", playtimeSec: thor }, ...(hulk != null ? [{ heroId: "hulk", playtimeSec: hulk }] : [])],
});

describe("board storage", () => {
  it("saves, clamps, and ignores unknown heroes", async () => {
    await setLevels(db, USER, [
      { heroId: "thor", level: 99 },
      { heroId: "not-a-hero", level: 5 },
      { heroId: "hulk", level: 0 },
    ]);
    const b = await getBoard(db, USER);
    expect(b.levels.thor.level).toBe(70);
    expect(b.levels.hulk.level).toBe(1);
    expect(b.levels["not-a-hero"]).toBeUndefined();
  });

  it("sets baselines on first sync and resets them when levels change", async () => {
    await setLevels(db, USER, [{ heroId: "thor", level: 15 }]);
    await linkPlayer(db, USER, "42", "Tester");
    await applySync(db, USER, stats(10_000, 500));

    let b = await getBoard(db, USER);
    expect(b.levels.thor.baselinePlaytimeSec).toBe(10_000);
    expect(b.playtime.hulk).toBe(500);
    expect(b.link?.lastSyncAt).not.toBeNull();

    // Play 2 hours, then correct Thor from 15 to 17 (960 points / 2h = 480/h).
    await applySync(db, USER, stats(10_000 + 7200));
    await setLevels(db, USER, [{ heroId: "thor", level: 17 }]);
    b = await getBoard(db, USER);
    expect(b.levels.thor.level).toBe(17);
    expect(b.levels.thor.baselinePlaytimeSec).toBe(17_200);
    expect(b.link?.pointsPerHour).toBe(Math.round(320 * 0.6 + 480 * 0.4));
  });

  it("does not learn a rate from an accepted estimate", async () => {
    await setLevels(db, USER, [{ heroId: "thor", level: 15 }]);
    await linkPlayer(db, USER, "42", "Tester");
    await applySync(db, USER, stats(0));
    await applySync(db, USER, stats(7200));
    await setLevels(db, USER, [{ heroId: "thor", level: 17 }], { learnRate: false });
    const b = await getBoard(db, USER);
    expect(b.link?.pointsPerHour).toBeNull();
  });

  it("import never overwrites saved levels", async () => {
    await setLevels(db, USER, [{ heroId: "thor", level: 30 }]);
    await setLevels(
      db,
      USER,
      [
        { heroId: "thor", level: 5 },
        { heroId: "loki", level: 12 },
      ],
      { onlyIfMissing: true },
    );
    const b = await getBoard(db, USER);
    expect(b.levels.thor.level).toBe(30);
    expect(b.levels.loki.level).toBe(12);
  });

  it("clears playtime baselines when switching or unlinking accounts", async () => {
    await setLevels(db, USER, [{ heroId: "thor", level: 20 }]);
    await linkPlayer(db, USER, "42", "Tester");
    await applySync(db, USER, stats(1000));
    await linkPlayer(db, USER, "77", "Other");
    let b = await getBoard(db, USER);
    expect(b.link?.rivalsUid).toBe("77");
    expect(b.levels.thor.baselinePlaytimeSec).toBeNull();
    expect(b.playtime).toEqual({});

    await applySync(db, USER, stats(50));
    await unlinkPlayer(db, USER);
    b = await getBoard(db, USER);
    expect(b.link).toBeNull();
    expect(b.levels.thor.level).toBe(20);
    expect(b.levels.thor.baselinePlaytimeSec).toBeNull();
  });

  it("restarts the baseline if upstream playtime goes backwards", async () => {
    await setLevels(db, USER, [{ heroId: "thor", level: 10 }]);
    await linkPlayer(db, USER, "42", "Tester");
    await applySync(db, USER, stats(9000));
    await applySync(db, USER, stats(100));
    const b = await getBoard(db, USER);
    expect(b.levels.thor.baselinePlaytimeSec).toBe(100);
  });

  it("deletes an account and everything tied to it, leaving other users alone", async () => {
    await db.insert(schema.users).values({ id: "u2", name: "Other" });
    await setLevels(db, "u2", [{ heroId: "loki", level: 9 }]);

    await setLevels(db, USER, [{ heroId: "thor", level: 20 }]);
    await linkPlayer(db, USER, "42", "Tester");
    await applySync(db, USER, stats(1000));
    await db.insert(schema.sessions).values({ sessionToken: "t1", userId: USER, expires: new Date(Date.now() + 864e5) });
    await db.insert(schema.accounts).values({ userId: USER, type: "oauth", provider: "discord", providerAccountId: "d1" });

    await deleteAccount(db, USER);

    expect(await db.select().from(schema.users).where(eq(schema.users.id, USER))).toHaveLength(0);
    for (const t of [schema.heroLevels, schema.heroPlaytime, schema.playerLinks]) {
      expect(await db.select().from(t).where(eq(t.userId, USER))).toHaveLength(0);
    }
    expect(await db.select().from(schema.sessions).where(eq(schema.sessions.userId, USER))).toHaveLength(0);
    expect(await db.select().from(schema.accounts).where(eq(schema.accounts.userId, USER))).toHaveLength(0);
    expect((await getBoard(db, "u2")).levels.loki.level).toBe(9);
  });
});

describe("screenshot scan limit", () => {
  it("allows up to the limit inside the window, then frees up", async () => {
    const day = 24 * 60 * 60 * 1000;
    const t0 = new Date("2026-09-28T10:00:00Z");
    expect(await takeScanSlot(db, USER, 2, day, t0)).toBe(true);
    expect(await takeScanSlot(db, USER, 2, day, t0)).toBe(true);
    expect(await takeScanSlot(db, USER, 2, day, t0)).toBe(false);
    expect(await takeScanSlot(db, USER, 2, day, new Date(t0.getTime() + day + 1000))).toBe(true);
  });
});

describe("rank-only levels", () => {
  it("stores the flag, clears it on a typed save of the same level, and never trains the rate", async () => {
    await linkPlayer(db, USER, "42", "Tester");
    await applySync(db, USER, stats(3600));
    await setLevels(db, USER, [{ heroId: "thor", level: 20, approx: true }]);
    let b = await getBoard(db, USER);
    expect(b.levels.thor).toMatchObject({ level: 20, approx: true });

    // Two hours later the player types the real level: rank-only start must not teach a pace.
    await applySync(db, USER, stats(3600 * 3));
    await setLevels(db, USER, [{ heroId: "thor", level: 20 }]);
    b = await getBoard(db, USER);
    expect(b.levels.thor).toMatchObject({ level: 20, approx: false });
    expect(b.link?.pointsPerHour).toBeNull();
  });
});
