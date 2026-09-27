import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";
import { heroLevels, heroPlaytime, playerLinks } from "@/db/schema";
import { isHeroId } from "@/lib/heroes";
import { blendRate, clampLevel, observedRate } from "@/lib/proficiency";
import type { PlayerStats } from "@/lib/rivals-api";

// Works with both postgres-js (app) and PGlite (tests).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema, any>;

export type BoardData = {
  levels: Record<string, { level: number; baselinePlaytimeSec: number | null }>;
  playtime: Record<string, number>;
  link: {
    rivalsUid: string;
    rivalsName: string;
    pointsPerHour: number | null;
    lastSyncAt: string | null;
  } | null;
};

export async function getBoard(db: AnyDb, userId: string): Promise<BoardData> {
  const [levels, playtime, links] = await Promise.all([
    db.select().from(heroLevels).where(eq(heroLevels.userId, userId)),
    db.select().from(heroPlaytime).where(eq(heroPlaytime.userId, userId)),
    db.select().from(playerLinks).where(eq(playerLinks.userId, userId)),
  ]);
  const link = links[0];
  return {
    levels: Object.fromEntries(
      levels.map((r) => [r.heroId, { level: r.level, baselinePlaytimeSec: r.baselinePlaytimeSec }]),
    ),
    playtime: Object.fromEntries(playtime.map((r) => [r.heroId, r.playtimeSec])),
    link: link
      ? {
          rivalsUid: link.rivalsUid,
          rivalsName: link.rivalsName,
          pointsPerHour: link.pointsPerHour,
          lastSyncAt: link.lastSyncAt?.toISOString() ?? null,
        }
      : null,
  };
}

export type LevelUpdate = { heroId: string; level: number };

/**
 * Save levels a player typed in. Each save resets that hero's baseline to its
 * current playtime. When a player raises a level after logging playtime, the
 * gap between points and hours teaches us their personal earn rate.
 */
export async function setLevels(
  db: AnyDb,
  userId: string,
  updates: LevelUpdate[],
  opts: { onlyIfMissing?: boolean; learnRate?: boolean } = {},
): Promise<void> {
  const clean = dedupe(updates.filter((u) => isHeroId(u.heroId)).map((u) => ({ heroId: u.heroId, level: clampLevel(u.level) })));
  if (!clean.length) return;
  const ids = clean.map((u) => u.heroId);

  const [existing, playtime, links] = await Promise.all([
    db.select().from(heroLevels).where(and(eq(heroLevels.userId, userId), inArray(heroLevels.heroId, ids))),
    db.select().from(heroPlaytime).where(and(eq(heroPlaytime.userId, userId), inArray(heroPlaytime.heroId, ids))),
    db.select().from(playerLinks).where(eq(playerLinks.userId, userId)),
  ]);
  const prev = new Map(existing.map((r) => [r.heroId, r]));
  const play = new Map(playtime.map((r) => [r.heroId, r.playtimeSec]));
  const link = links[0];

  let rate = link?.pointsPerHour ?? null;
  const rows = [];
  for (const u of clean) {
    const old = prev.get(u.heroId);
    if (opts.onlyIfMissing && old) continue;
    if (old && old.level === u.level) continue;
    const now = play.get(u.heroId) ?? null;
    if (opts.learnRate !== false && link && old && old.baselinePlaytimeSec != null && now != null) {
      const observed = observedRate(old.level, u.level, now - old.baselinePlaytimeSec);
      if (observed) rate = blendRate(rate, observed);
    }
    rows.push({ userId, heroId: u.heroId, level: u.level, baselinePlaytimeSec: now, setAt: new Date() });
  }
  if (!rows.length) return;

  await db
    .insert(heroLevels)
    .values(rows)
    .onConflictDoUpdate({
      target: [heroLevels.userId, heroLevels.heroId],
      set: {
        level: sql`excluded.level`,
        baselinePlaytimeSec: sql`excluded.baseline_playtime_sec`,
        setAt: sql`excluded.set_at`,
      },
    });

  if (link && rate !== link.pointsPerHour) {
    await db.update(playerLinks).set({ pointsPerHour: rate }).where(eq(playerLinks.userId, userId));
  }
}

function dedupe(list: LevelUpdate[]): LevelUpdate[] {
  const m = new Map<string, LevelUpdate>();
  for (const u of list) m.set(u.heroId, u);
  return [...m.values()];
}

export async function linkPlayer(db: AnyDb, userId: string, rivalsUid: string, rivalsName: string) {
  const [current] = await db.select().from(playerLinks).where(eq(playerLinks.userId, userId));
  if (current && current.rivalsUid !== rivalsUid) {
    // A different account's playtime means nothing for these baselines.
    await db.delete(heroPlaytime).where(eq(heroPlaytime.userId, userId));
    await db.update(heroLevels).set({ baselinePlaytimeSec: null }).where(eq(heroLevels.userId, userId));
  }
  await db
    .insert(playerLinks)
    .values({ userId, rivalsUid, rivalsName })
    .onConflictDoUpdate({
      target: playerLinks.userId,
      set: {
        rivalsUid,
        rivalsName,
        ...(current && current.rivalsUid !== rivalsUid
          ? { lastSyncAt: null, lastUpdateRequestAt: null, pointsPerHour: null }
          : {}),
      },
    });
}

export async function unlinkPlayer(db: AnyDb, userId: string) {
  await db.delete(heroPlaytime).where(eq(heroPlaytime.userId, userId));
  await db.update(heroLevels).set({ baselinePlaytimeSec: null }).where(eq(heroLevels.userId, userId));
  await db.delete(playerLinks).where(eq(playerLinks.userId, userId));
}

/** Store fresh playtime. Heroes whose level has no baseline yet get one now. */
export async function applySync(db: AnyDb, userId: string, stats: PlayerStats, now = new Date()) {
  if (stats.heroes.length) {
    await db
      .insert(heroPlaytime)
      .values(stats.heroes.map((h) => ({ userId, heroId: h.heroId, playtimeSec: h.playtimeSec, fetchedAt: now })))
      .onConflictDoUpdate({
        target: [heroPlaytime.userId, heroPlaytime.heroId],
        set: { playtimeSec: sql`excluded.playtime_sec`, fetchedAt: sql`excluded.fetched_at` },
      });

    const levels = await db.select().from(heroLevels).where(eq(heroLevels.userId, userId));
    const byHero = new Map(stats.heroes.map((h) => [h.heroId, h.playtimeSec]));
    for (const row of levels) {
      const p = byHero.get(row.heroId);
      if (row.baselinePlaytimeSec == null && p != null) {
        await db
          .update(heroLevels)
          .set({ baselinePlaytimeSec: p })
          .where(and(eq(heroLevels.userId, userId), eq(heroLevels.heroId, row.heroId)));
      } else if (row.baselinePlaytimeSec != null && p != null && p < row.baselinePlaytimeSec) {
        // Stats were reset upstream; start the estimate over.
        await db
          .update(heroLevels)
          .set({ baselinePlaytimeSec: p })
          .where(and(eq(heroLevels.userId, userId), eq(heroLevels.heroId, row.heroId)));
      }
    }
  }
  await db.update(playerLinks).set({ lastSyncAt: now }).where(eq(playerLinks.userId, userId));
}

export async function markUpdateRequested(db: AnyDb, userId: string, now = new Date()) {
  await db.update(playerLinks).set({ lastUpdateRequestAt: now }).where(eq(playerLinks.userId, userId));
}

export async function getLink(db: AnyDb, userId: string) {
  const [link] = await db.select().from(playerLinks).where(eq(playerLinks.userId, userId));
  return link ?? null;
}
