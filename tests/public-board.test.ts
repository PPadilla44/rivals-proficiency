import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";
import { deleteAccount, setLevels, type AnyDb } from "@/server/board";
import {
  TOKEN_PATTERN,
  getBoardLink,
  getPublicBoard,
  newToken,
  regenerateBoardLink,
  setBoardLinkEnabled,
  setBoardName,
} from "@/server/public-board";
import { recordEvent } from "@/server/events";
import { BOARD_NAME_MAX, cleanBoardName } from "@/lib/board-name";

let db: AnyDb;
const USER = "u1";
const OTHER = "u2";

beforeEach(async () => {
  const pg = drizzle(new PGlite(), { schema });
  await migrate(pg, { migrationsFolder: "./drizzle" });
  await pg.insert(schema.users).values([
    { id: USER, name: "Real Name", email: "me@example.com" },
    { id: OTHER, name: "Someone Else" },
  ]);
  db = pg as unknown as AnyDb;
});

describe("tokens", () => {
  it("are 8 characters from the safe alphabet and differ between calls", () => {
    const set = new Set(Array.from({ length: 200 }, newToken));
    expect(set.size).toBe(200);
    for (const t of set) expect(TOKEN_PATTERN.test(t)).toBe(true);
  });
});

describe("board link settings", () => {
  it("has no row until the player asks for one", async () => {
    expect(await getBoardLink(db, USER)).toBeNull();
  });

  it("turning on creates a token; turning off keeps it", async () => {
    const on = await setBoardLinkEnabled(db, USER, true);
    expect(on.enabled).toBe(true);
    const off = await setBoardLinkEnabled(db, USER, false);
    expect(off.enabled).toBe(false);
    expect(off.token).toBe(on.token);
    expect((await setBoardLinkEnabled(db, USER, true)).token).toBe(on.token);
  });

  it("a new link replaces the token and keeps the on/off state", async () => {
    const first = await setBoardLinkEnabled(db, USER, true);
    const next = await regenerateBoardLink(db, USER);
    expect(next.token).not.toBe(first.token);
    expect(next.enabled).toBe(true);
    expect(await getPublicBoard(db, first.token)).toBeNull();
  });

  it("making a new link before turning one on leaves it off", async () => {
    const link = await regenerateBoardLink(db, USER);
    expect(link.enabled).toBe(false);
  });

  it("stores a cleaned board name and clears it when empty", async () => {
    const saved = await setBoardName(db, USER, "  Hela   main  ");
    expect(saved.ok && saved.link.boardName).toBe("Hela main");
    const cleared = await setBoardName(db, USER, "   ");
    expect(cleared.ok && cleared.link.boardName).toBeNull();
  });

  it("refuses names that look like links, handles or are too long, and keeps the old name", async () => {
    await setBoardName(db, USER, "Pablo");
    for (const bad of ["visit example.com", "https://x.y", "@someone", "www.spam", "a".repeat(BOARD_NAME_MAX + 1)]) {
      const r = await setBoardName(db, USER, bad);
      expect(r.ok).toBe(false);
    }
    expect((await getBoardLink(db, USER))?.boardName).toBe("Pablo");
  });
});

describe("what a public page may read", () => {
  it("returns only levels and the typed name, never anything else about the player", async () => {
    await setLevels(db, USER, [{ heroId: "thor", level: 22 }, { heroId: "hulk", level: 9 }]);
    await setBoardName(db, USER, "Thor main");
    const { token } = await setBoardLinkEnabled(db, USER, true);
    const board = await getPublicBoard(db, token);
    expect(board).toEqual({ boardName: "Thor main", levels: { thor: 22, hulk: 9 } });
    const text = JSON.stringify(board);
    expect(text).not.toContain("Real Name");
    expect(text).not.toContain("me@example.com");
    expect(text).not.toContain(USER);
  });

  it("looks the same for off, unknown and malformed tokens", async () => {
    const { token } = await setBoardLinkEnabled(db, USER, true);
    await setBoardLinkEnabled(db, USER, false);
    expect(await getPublicBoard(db, token)).toBeNull();
    expect(await getPublicBoard(db, "zzzzzzzz")).toBeNull();
    expect(await getPublicBoard(db, "../etc/passwd")).toBeNull();
    expect(await getPublicBoard(db, "")).toBeNull();
    expect(await getPublicBoard(db, token.toUpperCase())).toBeNull();
  });

  it("does not show another player's levels", async () => {
    await setLevels(db, OTHER, [{ heroId: "groot", level: 30 }]);
    await setLevels(db, USER, [{ heroId: "thor", level: 5 }]);
    const { token } = await setBoardLinkEnabled(db, USER, true);
    expect((await getPublicBoard(db, token))?.levels).toEqual({ thor: 5 });
  });

  it("is gone when the account is deleted", async () => {
    const { token } = await setBoardLinkEnabled(db, USER, true);
    await deleteAccount(db, USER);
    expect(await getPublicBoard(db, token)).toBeNull();
    expect(await db.select().from(schema.publicBoards).where(eq(schema.publicBoards.userId, USER))).toHaveLength(0);
  });
});

describe("board name rules", () => {
  it("accepts plain names, including non-English", () => {
    for (const ok of ["Pablo", "Team Rocket 3", "ヒーロー", "O'Brien", "Hela main!"]) expect(cleanBoardName(ok).ok).toBe(true);
  });
  it("treats null and empty as no name", () => {
    expect(cleanBoardName(null)).toEqual({ ok: true, name: null });
    expect(cleanBoardName("")).toEqual({ ok: true, name: null });
  });
  it("strips control and direction characters", () => {
    const r = cleanBoardName("a‮b\u0000c");
    expect(r.ok && r.name).toBe("a b c");
  });
  it("rejects non-strings", () => {
    expect(cleanBoardName(42).ok).toBe(false);
  });
});

describe("public page events", () => {
  it("records board_view and board_cta without a user", async () => {
    expect(await recordEvent(db, { name: "board_view", visitorId: "visitor-12345" })).toBe(true);
    expect(await recordEvent(db, { name: "board_cta", visitorId: "visitor-12345" })).toBe(true);
    expect(await db.select().from(schema.events)).toHaveLength(2);
  });
});
