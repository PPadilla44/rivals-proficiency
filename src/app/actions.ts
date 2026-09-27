"use server";

import { z } from "zod";
import { requireUserId } from "@/auth";
import { getDb } from "@/db";
import {
  applySync,
  getBoard,
  getLink,
  linkPlayer,
  markUpdateRequested,
  setLevels,
  unlinkPlayer,
  type BoardData,
} from "@/server/board";
import {
  RivalsApiError,
  fetchPlayerStats,
  requestPlayerUpdate,
  resolvePlayer,
} from "@/lib/rivals-api";

export type ActionResult =
  | { ok: true; board: BoardData; message?: string }
  | { ok: false; error: string };

const updatesSchema = z
  .array(z.object({ heroId: z.string().max(64), level: z.number().int().min(1).max(70) }))
  .max(100);

const SYNC_COOLDOWN_MS = 5 * 60 * 1000;
const UPDATE_REQUEST_COOLDOWN_MS = 30 * 60 * 1000;

async function run(fn: (userId: string) => Promise<string | void>): Promise<ActionResult> {
  try {
    const userId = await requireUserId();
    const message = (await fn(userId)) ?? undefined;
    return { ok: true, board: await getBoard(getDb(), userId), message };
  } catch (e) {
    if (e instanceof RivalsApiError || e instanceof z.ZodError) {
      return { ok: false, error: e instanceof z.ZodError ? "Those levels look invalid." : e.message };
    }
    if (e instanceof Error && e.message.startsWith("Sign in")) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong saving that. Try again." };
  }
}

/**
 * Save typed levels. `fromEstimate` marks levels copied from our own estimate,
 * which must not be used to learn the player's earn rate.
 */
export async function saveLevelsAction(updates: unknown, fromEstimate = false) {
  return run(async (userId) => {
    await setLevels(getDb(), userId, updatesSchema.parse(updates), { learnRate: !fromEstimate });
  });
}

/** Copy levels from a guest session on this device, never overwriting saved ones. */
export async function importLevelsAction(updates: unknown) {
  return run(async (userId) => {
    await setLevels(getDb(), userId, updatesSchema.parse(updates), { onlyIfMissing: true, learnRate: false });
    return "Imported the levels from this device.";
  });
}

export async function linkPlayerAction(query: unknown) {
  return run(async (userId) => {
    const q = z.string().trim().min(2).max(64).parse(query);
    const player = await resolvePlayer(q);
    const db = getDb();
    await linkPlayer(db, userId, player.uid, player.name || q);
    const stats = await fetchPlayerStats(player.uid);
    await applySync(db, userId, stats);
    return `Linked ${player.name || q}. Estimates start counting from now.`;
  });
}

export async function unlinkPlayerAction() {
  return run(async (userId) => {
    await unlinkPlayer(getDb(), userId);
    return "Unlinked. Your levels are unchanged.";
  });
}

export async function syncAction() {
  return run(async (userId) => {
    const db = getDb();
    const link = await getLink(db, userId);
    if (!link) throw new RivalsApiError("Link your Marvel Rivals account first.", "not_found");

    const now = Date.now();
    if (link.lastSyncAt && now - link.lastSyncAt.getTime() < SYNC_COOLDOWN_MS) {
      const wait = Math.ceil((SYNC_COOLDOWN_MS - (now - link.lastSyncAt.getTime())) / 60000);
      return `Synced recently. You can sync again in ${wait} min.`;
    }

    // Ask the stats service to pull fresh matches. It allows one request per
    // player every 30 minutes, and new data can take a while to land.
    if (!link.lastUpdateRequestAt || now - link.lastUpdateRequestAt.getTime() > UPDATE_REQUEST_COOLDOWN_MS) {
      try {
        await requestPlayerUpdate(link.rivalsUid);
        await markUpdateRequested(db, userId);
      } catch {
        // Non-fatal: we still read whatever the service has.
      }
    }

    const stats = await fetchPlayerStats(link.rivalsUid);
    await applySync(db, userId, stats);
    return stats.unmatched.length
      ? `Synced. Skipped unknown heroes: ${stats.unmatched.join(", ")}.`
      : "Synced your latest playtime.";
  });
}
