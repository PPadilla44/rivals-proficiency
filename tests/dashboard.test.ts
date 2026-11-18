import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/server/board";
import { SERVER_VISITOR, recordEvent } from "@/server/events";
import { addDays, delta, getCohorts, getDashboard, getSources, keptLabel, pacificDay, parseRange, sourceName, weekStart } from "@/server/dashboard";

let db: AnyDb;
const oldAdmins = process.env.ADMIN_EMAILS;
beforeEach(async () => {
  process.env.ADMIN_EMAILS = "boss@example.com";
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  await pg.insert(schema.users).values([
    { id: "boss", name: "Boss", email: "boss@example.com" },
    { id: "u1", name: "A", email: "a@example.com" },
  ]);
  db = pg as unknown as AnyDb;
});
afterEach(() => {
  process.env.ADMIN_EMAILS = oldAdmins;
});

// 2026-11-20 12:00 Pacific (PST, UTC-8) is 20:00Z.
const now = new Date("2026-11-20T20:00:00Z");
const at = (iso: string) => new Date(iso);
const ev = (name: string, visitorId: string, when: string, extra: Record<string, unknown> = {}) =>
  recordEvent(db, { name: name as never, visitorId, at: at(when), ...extra } as never);

describe("dashboard days", () => {
  it("turns an instant into a Pacific day and adds days across DST", () => {
    expect(pacificDay(at("2026-11-20T07:59:00Z"))).toBe("2026-11-19");
    expect(pacificDay(at("2026-11-20T08:00:00Z"))).toBe("2026-11-20");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
    expect(addDays("2026-03-08", -1)).toBe("2026-03-07");
  });

  it("splits days at Pacific midnight, not UTC midnight", async () => {
    await ev("visit", "v-late-0000", "2026-11-19T07:30:00Z"); // 11:30 pm on the 18th Pacific
    await ev("visit", "v-early-0000", "2026-11-19T08:30:00Z"); // 12:30 am on the 19th Pacific
    const d = await getDashboard(db, "7", now);
    const get = (day: string) => d.days.find((x) => x.day === day)?.visitors;
    expect(get("2026-11-18")).toBe(1);
    expect(get("2026-11-19")).toBe(1);
    expect(d.days).toHaveLength(7);
    expect(d.days.at(-1)).toMatchObject({ day: "2026-11-20", today: true });
  });

  it("counts a visitor once per day and once across the period", async () => {
    await ev("visit", "visitor-0001", "2026-11-19T20:00:00Z");
    await ev("level_set", "visitor-0001", "2026-11-19T21:00:00Z");
    await ev("visit", "visitor-0001", "2026-11-20T18:00:00Z");
    const d = await getDashboard(db, "7", now);
    expect(d.now.visitors).toBe(1);
    expect(d.days.find((x) => x.day === "2026-11-19")).toMatchObject({ visitors: 1, interacted: 1 });
  });
});

describe("dashboard rules", () => {
  it("interacted means a level change or a saved import, not an opened import", async () => {
    await ev("import_open", "opener-0000", "2026-11-19T20:00:00Z");
    await ev("import_save", "saver-0000", "2026-11-19T20:00:00Z");
    await ev("level_set", "setter-0000", "2026-11-19T20:00:00Z");
    await ev("visit", "reader-0000", "2026-11-19T20:00:00Z");
    const d = await getDashboard(db, "7", now);
    expect(d.now.visitors).toBe(4);
    expect(d.now.interacted).toBe(2);
  });

  it("leaves out the server, the admin account and every browser it signed in on", async () => {
    await ev("visit", SERVER_VISITOR, "2026-11-19T20:00:00Z");
    await ev("visit", "boss-phone", "2026-11-17T20:00:00Z");
    await ev("identify", "boss-phone", "2026-11-19T20:00:00Z", { userId: "boss" });
    await ev("level_set", "boss-phone", "2026-11-19T21:00:00Z");
    await ev("visit", "real-0001", "2026-11-19T20:00:00Z");
    const d = await getDashboard(db, "7", now);
    expect(d.now.visitors).toBe(1);
    expect(d.ownerVisitorsLeftOut).toBe(1);
  });

  it("counts new accounts from the server's sign-in events, not the admin's", async () => {
    await ev("sign_in", SERVER_VISITOR, "2026-11-19T20:00:00Z", { userId: "u1", props: { new_user: true } });
    await ev("sign_in", SERVER_VISITOR, "2026-11-19T20:00:00Z", { userId: "boss", props: { new_user: true } });
    const d = await getDashboard(db, "7", now);
    expect(d.now.newAccounts).toBe(1);
  });

  it("compares with the same number of days just before", async () => {
    await ev("visit", "now-00001", "2026-11-19T20:00:00Z");
    await ev("visit", "now-00002", "2026-11-18T20:00:00Z");
    await ev("visit", "old-0001", "2026-11-10T20:00:00Z"); // inside the previous 7 days (Nov 7 to 13)
    const d = await getDashboard(db, "7", now);
    expect(d.now.visitors).toBe(2);
    expect(d.before?.visitors).toBe(1);
    expect((await getDashboard(db, "all", now)).before).toBeNull();
  });

  it("keeps a new visitor who came back another day or signed in, and ignores today's arrivals", async () => {
    await ev("visit", "back-0001", "2026-11-16T20:00:00Z");
    await ev("visit", "back-0001", "2026-11-18T20:00:00Z");
    await ev("visit", "signed-0000", "2026-11-16T20:00:00Z");
    await ev("identify", "signed-0000", "2026-11-16T20:05:00Z", { userId: "u1" });
    await ev("visit", "gone-0001", "2026-11-16T20:00:00Z");
    await ev("visit", "today-0000", "2026-11-20T18:00:00Z");
    const d = await getDashboard(db, "7", now);
    expect(d.now.keptBase).toBe(3);
    expect(d.now.kept).toBe(2);
  });

  it("does not call someone new if they were seen before the period", async () => {
    await ev("visit", "veteran-0000", "2026-10-01T20:00:00Z");
    await ev("visit", "veteran-0000", "2026-11-19T20:00:00Z");
    const d = await getDashboard(db, "7", now);
    expect(d.now.visitors).toBe(1);
    expect(d.now.keptBase).toBe(0);
  });
});

describe("dashboard labels", () => {
  it("shows n of N while the base is small and a percent after", () => {
    expect(keptLabel({ kept: 2, keptBase: 3 }).big).toBe("2 of 3");
    expect(keptLabel({ kept: 0, keptBase: 0 }).big).toBe("n/a");
    expect(keptLabel({ kept: 5, keptBase: 20 }).big).toBe("25%");
  });
  it("describes change against before", () => {
    expect(delta(10, null)).toBeNull();
    expect(delta(0, 0)?.dir).toBe("flat");
    expect(delta(5, 0)?.dir).toBe("up");
    expect(delta(15, 10)).toEqual({ text: "+50% vs the 10 before", dir: "up" });
    expect(delta(5, 10)?.dir).toBe("down");
  });
  it("falls back to 7 days for a bad range", () => {
    expect(parseRange("30")).toBe("30");
    expect(parseRange("all")).toBe("all");
    expect(parseRange("nope")).toBe("7");
    expect(parseRange(undefined)).toBe("7");
  });
});

describe("steps", () => {
  it("counts signed-in and returning visitors inside the period", async () => {
    await ev("visit", "steps-001", "2026-11-18T20:00:00Z");
    await ev("visit", "steps-001", "2026-11-19T20:00:00Z");
    await ev("visit", "steps-002", "2026-11-19T20:00:00Z");
    await ev("identify", "steps-002", "2026-11-19T20:05:00Z", { userId: "u1" });
    await ev("visit", "steps-003", "2026-11-19T20:00:00Z");
    const d = await getDashboard(db, "7", now);
    expect(d.now).toMatchObject({ visitors: 3, signedIn: 1, returning: 1 });
  });
});

describe("sources", () => {
  it("names the common sites and leaves others as their host", () => {
    expect(sourceName("google.com")).toBe("Google");
    expect(sourceName("google.co.uk")).toBe("Google");
    expect(sourceName("duckduckgo.com")).toBe("Other search");
    expect(sourceName("discord.com")).toBe("Discord");
    expect(sourceName("old.reddit.com")).toBe("Reddit");
    expect(sourceName("t.co")).toBe("X");
    expect(sourceName("direct")).toBe("Direct");
    expect(sourceName(null)).toBe("Not recorded");
    expect(sourceName("example.org")).toBe("example.org");
    expect(sourceName("notgoogle.com")).toBe("notgoogle.com");
  });

  it("uses each new visitor's first referrer, counts kept per source, leaves today out", async () => {
    await ev("visit", "src-goog-1", "2026-11-17T20:00:00Z", { props: { ref: "google.com" } });
    await ev("visit", "src-goog-1", "2026-11-19T20:00:00Z", { props: { ref: "direct" } }); // later visit does not change the source
    await ev("visit", "src-goog-2", "2026-11-17T20:00:00Z", { props: { ref: "google.com" } });
    await ev("visit", "src-disc-1", "2026-11-17T20:00:00Z", { props: { ref: "discord.com" } });
    await ev("visit", "src-disc-1", "2026-11-18T20:00:00Z", { props: { ref: "direct" } });
    await ev("level_set", "src-none-1", "2026-11-17T20:00:00Z"); // no referrer recorded
    await ev("visit", "src-today-1", "2026-11-20T18:00:00Z", { props: { ref: "reddit.com" } });
    const s = await getSources(db, "7", now);
    expect(s.to).toBe("2026-11-19");
    expect(s.total).toBe(4);
    expect(s.rows.map((r) => [r.source, r.visitors, r.kept])).toEqual([
      ["Google", 2, 1],
      ["Discord", 1, 1],
      ["Not recorded", 1, 0],
    ]);
    expect(s.kept).toBe(2);
  });

  it("skips visitors first seen before the range and the owner", async () => {
    await ev("visit", "src-old-01", "2026-10-20T20:00:00Z", { props: { ref: "google.com" } });
    await ev("visit", "src-old-01", "2026-11-18T20:00:00Z", { props: { ref: "google.com" } });
    await ev("visit", "src-boss-1", "2026-11-18T20:00:00Z", { props: { ref: "google.com" } });
    await ev("identify", "src-boss-1", "2026-11-18T20:05:00Z", { userId: "boss" });
    const s = await getSources(db, "7", now);
    expect(s.total).toBe(0);
    expect(s.rows).toEqual([]);
  });
});

describe("cohorts", () => {
  it("finds the Monday of a Pacific week", () => {
    expect(weekStart("2026-11-16")).toBe("2026-11-16");
    expect(weekStart("2026-11-20")).toBe("2026-11-16");
    expect(weekStart("2026-11-22")).toBe("2026-11-16");
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
  });

  it("groups new visitors by the week they first came and counts who was kept", async () => {
    await ev("visit", "coh-last-1", "2026-11-10T20:00:00Z"); // week of Nov 9
    await ev("visit", "coh-last-1", "2026-11-18T20:00:00Z"); // came back
    await ev("visit", "coh-last-2", "2026-11-11T20:00:00Z");
    await ev("visit", "coh-this-1", "2026-11-17T20:00:00Z"); // week of Nov 16
    await ev("visit", "coh-this-2", "2026-11-17T20:00:00Z");
    await ev("visit", "coh-this-2", "2026-11-19T20:00:00Z");
    await ev("visit", "coh-today-1", "2026-11-20T18:00:00Z"); // today, left out
    const weeks = await getCohorts(db, now);
    expect(weeks).toEqual([
      { start: "2026-11-09", visitors: 2, kept: 1, open: false },
      { start: "2026-11-16", visitors: 2, kept: 1, open: true },
    ]);
  });

  it("returns nothing when there are no visitors", async () => {
    expect(await getCohorts(db, now)).toEqual([]);
  });
});
