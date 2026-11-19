import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/server/board";
import { SERVER_VISITOR, recordEvent } from "@/server/events";
import { setBoardLinkEnabled } from "@/server/public-board";
import { getFeatures } from "@/server/features";

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

const now = new Date("2026-11-20T20:00:00Z"); // Friday 12:00 Pacific
const ev = (name: string, visitorId: string, when: string, props?: Record<string, string | number | boolean>, userId?: string) =>
  recordEvent(db, { name, visitorId, at: new Date(when), props, userId });
const step = (steps: { label: string; n: number }[], i: number) => steps[i].n;

describe("feature cards", () => {
  it("counts import steps by visitor and leaves out the owner and the server", async () => {
    await ev("import_open", "imp-aaaa-1", "2026-11-19T20:00:00Z");
    await ev("import_open", "imp-aaaa-1", "2026-11-19T21:00:00Z"); // same person twice
    await ev("import_read", "imp-aaaa-1", "2026-11-19T20:05:00Z", { screenshots: 3, heroes: 20, failed: 2, single: false });
    await ev("import_save", "imp-aaaa-1", "2026-11-19T20:10:00Z", { heroes: 18 });
    await ev("import_check", "imp-aaaa-1", "2026-11-19T20:11:00Z", { result: "right" });
    await ev("exact_prompt", "imp-aaaa-1", "2026-11-19T20:12:00Z", { heroes: 3, target: "lord" });
    await ev("exact_set", "imp-aaaa-1", "2026-11-19T20:13:00Z", { target: "lord", off: 2, confirm: false });
    await ev("exact_set", "imp-aaaa-1", "2026-11-19T20:14:00Z", { target: "lord", off: 0, confirm: true }); // same person twice
    await ev("exact_prompt", "imp-bbbb-2", "2026-11-19T20:12:00Z", { heroes: 1, target: "lord" });
    await ev("import_open", "imp-bbbb-2", "2026-11-19T20:00:00Z");
    await ev("import_read", "imp-bbbb-2", "2026-11-19T20:05:00Z", { screenshots: 1, heroes: 0, failed: 0, single: true });
    await ev("import_check", "imp-bbbb-2", "2026-11-19T20:06:00Z", { result: "off" });
    await ev("import_open", "boss-phone-1", "2026-11-19T20:00:00Z");
    await ev("identify", "boss-phone-1", "2026-11-19T20:01:00Z", {}, "boss");
    await ev("import_open", SERVER_VISITOR, "2026-11-19T20:00:00Z");
    const f = await getFeatures(db, "7", now);
    expect(f.import.steps.map((s) => s.n)).toEqual([2, 2, 1, 1, 2, 1]);
    expect(f.import).toMatchObject({ answeredOff: 1, readsTotal: 2, readsFailed: 1, wrongScreen: 1 });
  });

  it("counts share steps by visitor and the ways by picture", async () => {
    await ev("share", "shr-aaaa-1", "2026-11-18T20:00:00Z", { action: "ready", lord: 4 });
    await ev("share", "shr-aaaa-1", "2026-11-18T20:00:30Z", { action: "prompt", via: "idle" });
    await ev("share", "shr-aaaa-1", "2026-11-18T20:01:00Z", { action: "open", from: "button" });
    await ev("share", "shr-aaaa-1", "2026-11-18T20:02:00Z", { action: "done", how: "save", link: false });
    await ev("share", "shr-aaaa-1", "2026-11-18T20:03:00Z", { action: "done", how: "share", link: true });
    await ev("share", "shr-bbbb-2", "2026-11-18T20:00:00Z", { action: "ready", lord: 3 });
    const f = await getFeatures(db, "7", now);
    expect(f.share.steps.map((s) => s.n)).toEqual([2, 1, 1, 1]);
    expect(f.share.ways).toEqual({ share: 1, save: 1, copy: 0 });
    expect(f.share.withLink).toBe(1);
  });

  it("counts the calculator", async () => {
    await ev("calc", "calc-aaa-1", "2026-11-18T20:00:00Z", { action: "view" });
    await ev("calc", "calc-aaa-1", "2026-11-18T20:01:00Z", { action: "use" });
    await ev("calc", "calc-bbb-2", "2026-11-18T20:00:00Z", { action: "view" });
    const f = await getFeatures(db, "7", now);
    expect(f.calc.steps.map((s) => s.n).slice(0, 2)).toEqual([2, 1]);
  });

  it("counts the calculator's board box: seen, pressed, landed with the hero added, then did something", async () => {
    // aaa saw the box, pressed Add, landed with the hero added, then set another level.
    await ev("calc", "box-aaaa-1", "2026-11-18T20:00:00Z", { action: "box_seen" });
    await ev("calc", "box-aaaa-1", "2026-11-18T20:01:00Z", { action: "cta", via: "add", hero: "hulk" });
    await ev("calc", "box-aaaa-1", "2026-11-18T20:01:01Z", { action: "landed", result: "added" });
    await ev("level_set", "box-aaaa-1", "2026-11-18T20:03:00Z", { hero: "thor", level: 5 });
    // bbb saw it and pressed Open; the hero already existed; they did something before pressing, which does not count.
    await ev("level_set", "box-bbbb-2", "2026-11-18T19:00:00Z", { hero: "thor", level: 5 });
    await ev("calc", "box-bbbb-2", "2026-11-18T20:00:00Z", { action: "box_seen" });
    await ev("calc", "box-bbbb-2", "2026-11-18T20:01:00Z", { action: "cta", via: "open" });
    await ev("calc", "box-bbbb-2", "2026-11-18T20:01:01Z", { action: "landed", result: "exists" });
    // ccc only saw it.
    await ev("calc", "box-cccc-3", "2026-11-18T20:00:00Z", { action: "box_seen" });
    const f = await getFeatures(db, "7", now);
    expect(f.calc.steps.map((s) => s.n).slice(2)).toEqual([3, 2, 1, 1]);
  });

  it("counts board link viewers who are not the owner, and who started a board afterwards", async () => {
    await setBoardLinkEnabled(db, "u1", true);
    await ev("board_view", "friend-aa-1", "2026-11-18T20:00:00Z", { own: false });
    await ev("board_view", "friend-aa-1", "2026-11-18T20:30:00Z", { own: false });
    await ev("board_cta", "friend-aa-1", "2026-11-18T20:31:00Z");
    await ev("level_set", "friend-aa-1", "2026-11-18T20:40:00Z", { heroes: 1 });
    await ev("level_set", "friend-bb-2", "2026-11-17T20:40:00Z", { heroes: 1 }); // before viewing
    await ev("board_view", "friend-bb-2", "2026-11-18T20:00:00Z", { own: false });
    await ev("board_view", "owner-phone-1", "2026-11-18T20:00:00Z", { own: true }, "u1");
    const f = await getFeatures(db, "7", now);
    expect(f.link.steps.map((s) => s.n)).toEqual([2, 1, 1]);
    expect(f.link.views).toBe(3);
    expect(f.link).toMatchObject({ linksOn: 1, accounts: 2 });
  });

  it("follows the range for steps but always gives 8 weeks", async () => {
    await ev("calc", "old-calc-01", "2026-11-01T20:00:00Z", { action: "view" }); // 19 days ago
    await ev("calc", "new-calc-01", "2026-11-18T20:00:00Z", { action: "view" });
    const week = await getFeatures(db, "7", now);
    const month = await getFeatures(db, "30", now);
    expect(step(week.calc.steps, 0)).toBe(1);
    expect(step(month.calc.steps, 0)).toBe(2);
    expect(week.weeks).toHaveLength(8);
    expect(week.weeks.at(-1)).toMatchObject({ start: "2026-11-16", open: true, calc: 1 });
    expect(week.weeks.find((w) => w.start === "2026-10-26")).toMatchObject({ open: false, calc: 1 }); // Nov 1 falls in the week of Oct 26
  });

  it("fills the weekly strip per feature", async () => {
    await ev("import_save", "wk-save-001", "2026-11-10T20:00:00Z", { heroes: 3 });
    await ev("share", "wk-share-01", "2026-11-18T20:00:00Z", { action: "done", how: "copy", link: false });
    await ev("board_view", "wk-view-001", "2026-11-18T20:00:00Z", { own: false });
    await ev("board_view", "wk-view-001", "2026-11-18T21:00:00Z", { own: false });
    const f = await getFeatures(db, "7", now);
    expect(f.weeks.find((w) => w.start === "2026-11-09")).toMatchObject({ import: 1, share: 0, link: 0 });
    expect(f.weeks.at(-1)).toMatchObject({ import: 0, share: 1, link: 2 });
  });
});
