import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import { applySync, getBoard, linkPlayer, setLevels, unlinkPlayer, type AnyDb } from "@/server/board";

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
});
