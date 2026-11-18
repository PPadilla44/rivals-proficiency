import { eq } from "drizzle-orm";
import { randomInt } from "node:crypto";
import { heroLevels, publicBoards } from "@/db/schema";
import { cleanBoardName } from "@/lib/board-name";
import type { AnyDb } from "./board";

// No 0, o, 1, l or i: tokens get read aloud and typed.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const TOKEN_LENGTH = 8;
export const TOKEN_PATTERN = /^[23456789abcdefghjkmnpqrstuvwxyz]{8}$/;

export function newToken(): string {
  let t = "";
  for (let i = 0; i < TOKEN_LENGTH; i++) t += ALPHABET[randomInt(ALPHABET.length)];
  return t;
}

export type BoardLink = { enabled: boolean; token: string; boardName: string | null };

const isUniqueViolation = (e: unknown): boolean => {
  const code = (e as { code?: string; cause?: { code?: string } })?.code ?? (e as { cause?: { code?: string } })?.cause?.code;
  return code === "23505";
};

/** Insert a row with a fresh token, retrying on the (very unlikely) clash. */
async function insertWithFreshToken(db: AnyDb, userId: string, values: { enabled: boolean }): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.insert(publicBoards).values({ userId, token: newToken(), enabled: values.enabled }).onConflictDoNothing({ target: publicBoards.userId });
      return;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new Error("Could not make a board link. Try again.");
}

export async function getBoardLink(db: AnyDb, userId: string): Promise<BoardLink | null> {
  const [row] = await db.select().from(publicBoards).where(eq(publicBoards.userId, userId));
  return row ? { enabled: row.enabled, token: row.token, boardName: row.boardName } : null;
}

/** Turn the link on or off. The first time on creates the token; turning it off keeps it. */
export async function setBoardLinkEnabled(db: AnyDb, userId: string, enabled: boolean): Promise<BoardLink> {
  if (!(await getBoardLink(db, userId))) await insertWithFreshToken(db, userId, { enabled });
  await db.update(publicBoards).set({ enabled, updatedAt: new Date() }).where(eq(publicBoards.userId, userId));
  return (await getBoardLink(db, userId))!;
}

/** Replace the token, so anyone holding the old link loses access. Leaves the on/off state alone. */
export async function regenerateBoardLink(db: AnyDb, userId: string): Promise<BoardLink> {
  if (!(await getBoardLink(db, userId))) await insertWithFreshToken(db, userId, { enabled: false });
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await db.update(publicBoards).set({ token: newToken(), updatedAt: new Date() }).where(eq(publicBoards.userId, userId));
      return (await getBoardLink(db, userId))!;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
  }
  throw new Error("Could not make a new link. Try again.");
}

export type NameSaved = { ok: true; link: BoardLink } | { ok: false; error: string };

export async function setBoardName(db: AnyDb, userId: string, input: unknown): Promise<NameSaved> {
  const cleaned = cleanBoardName(input);
  if (!cleaned.ok) return cleaned;
  if (!(await getBoardLink(db, userId))) await insertWithFreshToken(db, userId, { enabled: false });
  await db.update(publicBoards).set({ boardName: cleaned.name, updatedAt: new Date() }).where(eq(publicBoards.userId, userId));
  return { ok: true, link: (await getBoardLink(db, userId))! };
}

export type PublicBoard = {
  boardName: string | null;
  /** Level per hero id, only for heroes the player has set. Nothing else about the player. */
  levels: Record<string, number>;
  /** Hero ids whose level is only known to the rank (from a screenshot), so the page shows "15+". */
  approx: string[];
};

/**
 * What a public page may show. Returns null for a malformed token, an unknown token or a link
 * that is off, so all three look the same from outside. Only hero levels leave the database:
 * no user id, email, profile name, playtime or linked game account.
 */
export async function getPublicBoard(db: AnyDb, token: string): Promise<PublicBoard | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const [row] = await db.select().from(publicBoards).where(eq(publicBoards.token, token));
  if (!row || !row.enabled) return null;
  const rows = await db.select({ heroId: heroLevels.heroId, level: heroLevels.level, approx: heroLevels.approx }).from(heroLevels).where(eq(heroLevels.userId, row.userId));
  return {
    boardName: row.boardName,
    levels: Object.fromEntries(rows.map((r) => [r.heroId, r.level])),
    approx: rows.filter((r) => r.approx).map((r) => r.heroId),
  };
}

/** True when the signed-in viewer owns the board at this address. Says nothing else about the owner. */
export async function isBoardOwner(db: AnyDb, token: string, userId: string | null | undefined): Promise<boolean> {
  if (!userId || !TOKEN_PATTERN.test(token)) return false;
  const [row] = await db.select({ userId: publicBoards.userId }).from(publicBoards).where(eq(publicBoards.token, token));
  return row?.userId === userId;
}
