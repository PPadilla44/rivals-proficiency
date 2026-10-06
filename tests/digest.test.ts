import { beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/server/board";
import { SERVER_VISITOR, getReferrers, getStats, recordEvent } from "@/server/events";
import { buildDigest, sendDailyDigest } from "@/server/digest";

let db: AnyDb;
beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  await pg.insert(schema.users).values({ id: "u1", name: "Tester" });
  db = pg as unknown as AnyDb;
});

const now = new Date("2026-10-06T15:30:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

async function seed() {
  // Last 24 hours: three visitors, one interacts, one new account, one problem.
  await recordEvent(db, { name: "visit", visitorId: "digest-a-1", props: { device: "mobile", ref: "google.com" }, at: hoursAgo(2) });
  await recordEvent(db, { name: "visit", visitorId: "digest-b-1", props: { device: "mobile", ref: "google.com" }, at: hoursAgo(3) });
  await recordEvent(db, { name: "visit", visitorId: "digest-c-1", props: { device: "desktop", ref: "direct" }, at: hoursAgo(4) });
  await recordEvent(db, { name: "level_set", visitorId: "digest-c-1", props: { heroes: 6, taps: 40, device: "desktop" }, at: hoursAgo(4) });
  await recordEvent(db, { name: "sign_in", visitorId: SERVER_VISITOR, userId: "u1", props: { new_user: true }, at: hoursAgo(5) });
  await recordEvent(db, { name: "problem", visitorId: SERVER_VISITOR, props: { kind: "import_failed" }, at: hoursAgo(6) });
  // The 24 hours before: one visitor who interacted.
  await recordEvent(db, { name: "visit", visitorId: "digest-d-1", props: { device: "desktop", ref: "reddit.com" }, at: hoursAgo(30) });
  await recordEvent(db, { name: "level_set", visitorId: "digest-d-1", props: { heroes: 2, taps: 2 }, at: hoursAgo(30) });
}

describe("daily digest", () => {
  it("keeps each stats window to its own 24 hours", async () => {
    await seed();
    expect((await getStats(db, 1, now)).visitors).toBe(3);
    const before = await getStats(db, 1, hoursAgo(24));
    expect(before.visitors).toBe(1);
    expect(before.levelSets).toBe(2);
  });

  it("lists where visitors came from", async () => {
    await seed();
    expect(await getReferrers(db, hoursAgo(24), now)).toEqual([
      { ref: "google.com", visitors: 2 },
      { ref: "direct", visitors: 1 },
    ]);
  });

  it("writes the last 24 hours next to the previous 24", async () => {
    await seed();
    const text = await buildDigest(db, { now, cap: 50 });
    expect(text).toContain("Visitors: **3** (1)");
    expect(text).toContain("Interacted: **1**, 33% (1, 100%)");
    expect(text).toContain("New accounts: **1** (0), 1 in total");
    expect(text).toContain("Heroes updated: **6** (2), 40 changes counting taps");
    expect(text).toContain("screenshots read 0 of 50");
    expect(text).toContain("Devices: phone 2, computer 1");
    expect(text).toContain("Came from: google.com 2, direct 1");
    expect(text).toContain("Problems: Screenshot reader failed x1");
    expect(text).not.toContain("—");
    expect(text.length).toBeLessThan(2000);
  });

  it("sends once, skips a repeat inside 20 hours, and sends again when forced", async () => {
    await seed();
    const send = vi.fn(async () => {});
    expect((await sendDailyDigest(db, { now, send })).sent).toBe(true);
    expect(await sendDailyDigest(db, { now: new Date(now.getTime() + 3_600_000), send })).toMatchObject({ sent: false, reason: "too_soon" });
    expect((await sendDailyDigest(db, { now: new Date(now.getTime() + 3_600_000), send, force: true })).sent).toBe(true);
    expect((await sendDailyDigest(db, { now: new Date(now.getTime() + 24 * 3_600_000), send })).sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("does nothing without a webhook", async () => {
    vi.stubEnv("ALERT_WEBHOOK_URL", "");
    expect(await sendDailyDigest(db, { now })).toMatchObject({ sent: false, reason: "no_webhook" });
    vi.unstubAllEnvs();
  });
});
