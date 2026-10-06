import { and, eq, gte, sql } from "drizzle-orm";
import { events, users } from "@/db/schema";
import { SITE_URL } from "@/lib/site-url";
import { getProblems, sendWebhook, type Send } from "./alerts";
import { countScans, type AnyDb } from "./board";
import { SERVER_VISITOR, getReferrers, getStats, recordEvent } from "./events";

const DAY = 86_400_000;
/** A second digest inside this window is skipped, so the route cannot be used to spam the channel. */
const MIN_GAP_MS = 20 * 60 * 60_000;

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");

/** The daily summary: the last 24 hours next to the 24 hours before. */
export async function buildDigest(db: AnyDb, opts: { now?: Date; cap?: number } = {}): Promise<string> {
  const now = opts.now ?? new Date();
  const dayAgo = new Date(now.getTime() - DAY);
  const [today, before, refs, problems, reads, [{ accounts }]] = await Promise.all([
    getStats(db, 1, now),
    getStats(db, 1, dayAgo),
    getReferrers(db, dayAgo, now, 6),
    getProblems(db, 1, now),
    countScans(db, dayAgo),
    db.select({ accounts: sql<number>`count(*)::int` }).from(users),
  ]);

  const device = (d: string) => today.devices.find((x) => x.device === d)?.visitors ?? 0;
  const lines = [
    `📊 **Proficiency Board, last 24 hours** (previous 24 hours in brackets)`,
    `Visitors: **${today.visitors}** (${before.visitors})`,
    `Interacted: **${today.interacted}**, ${pct(today.interacted, today.visitors)} (${before.interacted}, ${pct(before.interacted, before.visitors)})`,
    `New accounts: **${today.newAccounts}** (${before.newAccounts}), ${accounts} in total`,
    `Heroes updated: **${today.levelSets}** (${before.levelSets}), ${today.levelTaps} changes counting taps`,
    `Imports saved: **${today.importsSaved}** (${before.importsSaved}), screenshots read ${reads}${opts.cap ? ` of ${opts.cap}` : ""}`,
    `Devices: phone ${device("mobile")}, computer ${device("desktop")}`,
    `Came from: ${refs.length ? refs.map((r) => `${r.ref} ${r.visitors}`).join(", ") : "nothing recorded yet"}`,
    `Problems: ${problems.length ? problems.map((p) => `${p.label} x${p.count}`).join("; ") : "none"}`,
    `${SITE_URL}/stats`,
  ];
  return lines.join("\n");
}

export type DigestResult = { sent: boolean; reason?: "too_soon" | "no_webhook" | "failed"; text?: string };

/**
 * Post the daily digest to the alert channel. Skipped when one already went
 * out in the last 20 hours, unless `force` (the admin button on /stats).
 */
export async function sendDailyDigest(
  db: AnyDb,
  opts: { now?: Date; send?: Send; force?: boolean; cap?: number } = {},
): Promise<DigestResult> {
  const now = opts.now ?? new Date();
  if (!opts.send && !process.env.ALERT_WEBHOOK_URL) return { sent: false, reason: "no_webhook" };
  if (!opts.force) {
    const [{ recent }] = await db
      .select({ recent: sql<number>`count(*)::int` })
      .from(events)
      .where(and(eq(events.name, "digest_sent"), gte(events.createdAt, new Date(now.getTime() - MIN_GAP_MS))));
    if (recent > 0) return { sent: false, reason: "too_soon" };
  }
  const text = await buildDigest(db, { now, cap: opts.cap });
  try {
    // Record first: if two requests race, the second sees this row and skips.
    await recordEvent(db, { name: "digest_sent", visitorId: SERVER_VISITOR, at: now });
    await (opts.send ?? sendWebhook)(text);
    return { sent: true, text };
  } catch (e) {
    console.error("daily digest failed", e);
    return { sent: false, reason: "failed", text };
  }
}
