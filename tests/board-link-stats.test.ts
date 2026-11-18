import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import type { AnyDb } from "@/server/board";
import { SERVER_VISITOR, recordEvent } from "@/server/events";
import { setBoardLinkEnabled, isBoardOwner, getBoardLink } from "@/server/public-board";
import { SMALL_NUMBERS, boardLinkLine, getBoardLinkStats } from "@/server/board-link-stats";
import { buildDigest } from "@/server/digest";

let db: AnyDb;
beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  await pg.insert(schema.users).values([{ id: "u1", name: "A" }, { id: "u2", name: "B" }, { id: "u3", name: "C" }]);
  db = pg as unknown as AnyDb;
});

const now = new Date("2026-11-20T18:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * 3_600_000);
const day = (s: Awaited<ReturnType<typeof getBoardLinkStats>>) => s;

describe("board link stats", () => {
  it("is all zeros with no events and no links", async () => {
    const s = day(await getBoardLinkStats(db, ago(24), now));
    expect(s).toEqual({ linksOn: 0, accounts: 3, turnedOn: 0, views: 0, viewers: 0, cta: 0, started: 0, copies: 0, phoneShares: 0, sharesWithLink: 0 });
  });

  it("counts links that are on right now, not links that were ever made", async () => {
    await setBoardLinkEnabled(db, "u1", true);
    await setBoardLinkEnabled(db, "u2", true);
    await setBoardLinkEnabled(db, "u2", false);
    const s = await getBoardLinkStats(db, ago(24), now);
    expect(s.linksOn).toBe(1);
    expect(s.accounts).toBe(3);
  });

  it("leaves the owner's own views out and counts viewers once", async () => {
    await recordEvent(db, { name: "board_view", visitorId: "friend-0001", props: { own: false, device: "mobile" }, at: ago(3) });
    await recordEvent(db, { name: "board_view", visitorId: "friend-0001", props: { own: false }, at: ago(2) });
    await recordEvent(db, { name: "board_view", visitorId: "friend-0002", props: { own: false }, at: ago(2) });
    await recordEvent(db, { name: "board_view", visitorId: "owner-0001", userId: "u1", props: { own: true }, at: ago(1) });
    const s = await getBoardLinkStats(db, ago(24), now);
    expect(s.views).toBe(3);
    expect(s.viewers).toBe(2);
  });

  it("counts visitors who started a board only after they viewed one", async () => {
    // Started before viewing: does not count.
    await recordEvent(db, { name: "level_set", visitorId: "before-0001", props: { heroes: 1 }, at: ago(10) });
    await recordEvent(db, { name: "board_view", visitorId: "before-0001", props: { own: false }, at: ago(5) });
    // Viewed, pressed the button, then set a level.
    await recordEvent(db, { name: "board_view", visitorId: "after-00001", props: { own: false }, at: ago(5) });
    await recordEvent(db, { name: "board_cta", visitorId: "after-00001", at: ago(5) });
    await recordEvent(db, { name: "level_set", visitorId: "after-00001", props: { heroes: 1 }, at: ago(4) });
    // Viewed and used the import.
    await recordEvent(db, { name: "board_view", visitorId: "import-0001", props: { own: false }, at: ago(5) });
    await recordEvent(db, { name: "import_open", visitorId: "import-0001", at: ago(4) });
    // Viewed and left.
    await recordEvent(db, { name: "board_view", visitorId: "left-000001", props: { own: false }, at: ago(5) });
    const s = await getBoardLinkStats(db, ago(24), now);
    expect(s.viewers).toBe(4);
    expect(s.cta).toBe(1);
    expect(s.started).toBe(2);
  });

  it("counts turn-ons, copies, phone shares and pictures shared with the link", async () => {
    await recordEvent(db, { name: "board_link", visitorId: "owner-0001", userId: "u1", props: { action: "on", from: "share" }, at: ago(5) });
    await recordEvent(db, { name: "board_link", visitorId: "owner-0001", userId: "u1", props: { action: "on", from: "menu" }, at: ago(4) });
    await recordEvent(db, { name: "board_link", visitorId: "owner-0002", userId: "u2", props: { action: "on", from: "menu" }, at: ago(4) });
    await recordEvent(db, { name: "board_link", visitorId: "owner-0001", userId: "u1", props: { action: "copy", from: "menu" }, at: ago(3) });
    await recordEvent(db, { name: "board_link", visitorId: "owner-0001", userId: "u1", props: { action: "share", from: "share" }, at: ago(3) });
    await recordEvent(db, { name: "board_link", visitorId: "owner-0001", userId: "u1", props: { action: "open", from: "menu" }, at: ago(3) });
    await recordEvent(db, { name: "share", visitorId: "owner-0001", props: { action: "done", how: "share", link: true }, at: ago(2) });
    await recordEvent(db, { name: "share", visitorId: "owner-0003", props: { action: "done", how: "save", link: false }, at: ago(2) });
    await recordEvent(db, { name: "share", visitorId: "owner-0003", props: { action: "open", link: true }, at: ago(2) });
    const s = await getBoardLinkStats(db, ago(24), now);
    expect(s.turnedOn).toBe(2); // two players, one of them twice
    expect(s.copies).toBe(1);
    expect(s.phoneShares).toBe(1);
    expect(s.sharesWithLink).toBe(1);
  });

  it("keeps to the window and ignores the server's own events", async () => {
    await recordEvent(db, { name: "board_view", visitorId: "old-0000001", props: { own: false }, at: ago(30) });
    await recordEvent(db, { name: "board_view", visitorId: SERVER_VISITOR, props: { own: false }, at: ago(2) });
    const s = await getBoardLinkStats(db, ago(24), now);
    expect(s.views).toBe(0);
  });
});

describe("board link wording", () => {
  const base = { linksOn: 4, accounts: 112, turnedOn: 2, views: 18, viewers: 11, cta: 5, started: 3, copies: 6, phoneShares: 2, sharesWithLink: 1 };
  it("says what happened, and flags small numbers", () => {
    const lines = boardLinkLine(base);
    expect(lines[0]).toBe("Links on 4 of 112 accounts · turned on 2");
    expect(lines[1]).toBe("Views 18 by 11 visitors · Track your own board clicks 5 · started a board after 3 (small numbers)");
    expect(lines[2]).toBe("Link copied 6 · sent from a phone 2 · pictures shared with the link 1");
    expect(boardLinkLine({ ...base, views: SMALL_NUMBERS })[1]).not.toContain("small numbers");
    expect(boardLinkLine({ ...base, views: 1, viewers: 1 })[1]).toContain("by 1 visitor ·");
  });
});

describe("owner check", () => {
  it("is true only for the owner of that address", async () => {
    const link = await setBoardLinkEnabled(db, "u1", true);
    expect(await isBoardOwner(db, link.token, "u1")).toBe(true);
    expect(await isBoardOwner(db, link.token, "u2")).toBe(false);
    expect(await isBoardOwner(db, link.token, null)).toBe(false);
    expect(await isBoardOwner(db, "bad token", "u1")).toBe(false);
    expect((await getBoardLink(db, "u1"))?.token).toBe(link.token);
  });
});

describe("digest", () => {
  it("has a Board link section", async () => {
    await setBoardLinkEnabled(db, "u1", true);
    const text = await buildDigest(db, { now, search: async () => [] });
    expect(text).toContain("**Board link**");
    expect(text).toContain("Links on 1 of 3 accounts");
  });
});
