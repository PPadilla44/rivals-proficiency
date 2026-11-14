import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { events, feedback } from "@/db/schema";
import { SITE_URL } from "@/lib/site-url";
import { FEEDBACK_KINDS, FEEDBACK_KIND_LABEL, FEEDBACK_LIMITS, type FeedbackKind } from "@/lib/feedback-shared";
import type { AnyDb } from "./board";
import { sendWebhook, type Send } from "./alerts";

/**
 * The Feedback form: what a message looks like, how many one browser may send,
 * and the short Discord ping that tells the owner one arrived.
 */

export { FEEDBACK_KINDS, FEEDBACK_KIND_LABEL, FEEDBACK_LIMITS, type FeedbackKind };

const clean = (s: string) => s.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim();

const inputSchema = z.object({
  kind: z.enum(FEEDBACK_KINDS),
  message: z
    .string()
    .transform(clean)
    .pipe(z.string().min(FEEDBACK_LIMITS.minChars, "Write a few words so I know what you mean.").max(FEEDBACK_LIMITS.maxChars, `Keep it under ${FEEDBACK_LIMITS.maxChars} characters.`)),
  // Optional, for a reply. Empty means none.
  email: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || undefined)
    .pipe(z.string().email("That email doesn't look right.").optional()),
  device: z.enum(["mobile", "desktop"]).optional(),
  page: z.string().max(100).optional(),
});

export type FeedbackInput = z.infer<typeof inputSchema>;

export function parseFeedback(input: unknown): { ok: true; value: FeedbackInput } | { ok: false; error: string } {
  const r = inputSchema.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, error: r.error.issues[0]?.message ?? "That didn't send. Check it and try again." };
}

/** A form that sat open for less than this was filled in by a script, not a person. */
export const FEEDBACK_MIN_MS = 1000;

/** The hidden field was filled, or the form was sent faster than a person could write. */
export function looksAutomated(trap?: { website?: unknown; openedMs?: unknown }): boolean {
  if (typeof trap?.website === "string" && trap.website.trim()) return true;
  return typeof trap?.openedMs === "number" && trap.openedMs < FEEDBACK_MIN_MS;
}

export type FeedbackSave = "saved" | "visitor_limit" | "site_limit" | "duplicate";

/** Store one message unless this browser or the whole site is over its hourly limit. */
export async function saveFeedback(
  db: AnyDb,
  input: FeedbackInput,
  who: { visitorId: string; userId?: string | null },
  now = new Date(),
): Promise<FeedbackSave> {
  const hourAgo = new Date(now.getTime() - 3_600_000).toISOString();
  const [{ mine, all, same }] = await db
    .select({
      mine: sql<number>`count(*) filter (where ${feedback.visitorId} = ${who.visitorId} and ${feedback.createdAt} >= ${hourAgo}::timestamptz)::int`,
      all: sql<number>`count(*) filter (where ${feedback.createdAt} >= ${hourAgo}::timestamptz)::int`,
      // The same words sent twice in a day (a double tap, a retry) are kept once.
      same: sql<number>`count(*) filter (where ${feedback.visitorId} = ${who.visitorId} and ${feedback.message} = ${input.message})::int`,
    })
    .from(feedback)
    .where(gte(feedback.createdAt, new Date(now.getTime() - 86_400_000)));
  if (same > 0) return "duplicate";
  if (mine >= FEEDBACK_LIMITS.visitorPerHour) return "visitor_limit";
  if (all >= FEEDBACK_LIMITS.sitePerHour) return "site_limit";
  await db.insert(feedback).values({
    kind: input.kind,
    message: input.message,
    email: input.email ?? null,
    userId: who.userId ?? null,
    visitorId: who.visitorId,
    device: input.device ?? null,
    page: input.page ?? null,
    createdAt: now,
  });
  return "saved";
}

export type FeedbackRow = {
  id: number;
  kind: FeedbackKind;
  message: string;
  email: string | null;
  signedIn: boolean;
  device: string | null;
  page: string | null;
  createdAt: string;
};

/** Newest first, for /stats. */
export async function listFeedback(db: AnyDb, days: number, limit = 50, now = new Date()): Promise<FeedbackRow[]> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const rows = await db
    .select()
    .from(feedback)
    .where(gte(feedback.createdAt, since))
    .orderBy(desc(feedback.createdAt))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    kind: (FEEDBACK_KINDS as readonly string[]).includes(r.kind) ? (r.kind as FeedbackKind) : "other",
    message: r.message,
    email: r.email,
    signedIn: !!r.userId,
    device: r.device,
    page: r.page,
    createdAt: r.createdAt.toISOString(),
  }));
}

export type FeedbackCounts = { total: number; bug: number; idea: number; other: number };

/** Messages in a window, by kind, for the daily digest. */
export async function countFeedback(db: AnyDb, since: Date, until: Date): Promise<FeedbackCounts> {
  const [r] = await db
    .select({
      total: sql<number>`count(*)::int`,
      bug: sql<number>`count(*) filter (where ${feedback.kind} = 'bug')::int`,
      idea: sql<number>`count(*) filter (where ${feedback.kind} = 'idea')::int`,
      other: sql<number>`count(*) filter (where ${feedback.kind} not in ('bug', 'idea'))::int`,
    })
    .from(feedback)
    .where(and(gte(feedback.createdAt, since), sql`${feedback.createdAt} <= ${until.toISOString()}::timestamptz`));
  return { total: r?.total ?? 0, bug: r?.bug ?? 0, idea: r?.idea ?? 0, other: r?.other ?? 0 };
}

/** People who opened the form in a window (each counted once), for the digest's "opened by N". */
export async function countFeedbackOpens(db: AnyDb, since: Date, until: Date): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(distinct ${events.visitorId})::int` })
    .from(events)
    .where(and(eq(events.name, "feedback_open"), gte(events.createdAt, since), sql`${events.createdAt} <= ${until.toISOString()}::timestamptz`));
  return r?.n ?? 0;
}

/** The Discord message: the kind, who, and a short quote. Nobody's text can ping @everyone or roles. */
export function feedbackPing(row: { kind: FeedbackKind; message: string; hasEmail: boolean; signedIn: boolean; device?: string | null }): string {
  const quote = row.message
    .replace(/@/g, "@​")
    .replace(/`/g, "'")
    .split("\n")
    .slice(0, 6)
    .map((l) => `> ${l.slice(0, 200)}`)
    .join("\n")
    .slice(0, 500);
  const who = [row.signedIn ? "signed in" : "guest", row.device === "mobile" ? "phone" : row.device === "desktop" ? "computer" : null, row.hasEmail ? "left an email" : null]
    .filter(Boolean)
    .join(", ");
  return `💬 **Feedback: ${FEEDBACK_KIND_LABEL[row.kind]}** (${who})\n${quote}\n${SITE_URL}/stats`;
}

/** Ping the alert channel, at most `pingPerHour` times an hour. Never throws; the message is already saved. */
export async function notifyFeedback(
  db: AnyDb,
  row: Parameters<typeof feedbackPing>[0],
  opts: { send?: Send; now?: Date } = {},
): Promise<boolean> {
  try {
    const now = opts.now ?? new Date();
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(feedback)
      .where(gte(feedback.createdAt, new Date(now.getTime() - 3_600_000)));
    // The message was just stored, so it counts itself; past the cap, later ones stay in /stats and the digest.
    if (n > FEEDBACK_LIMITS.pingPerHour) return false;
    await (opts.send ?? sendWebhook)(feedbackPing(row));
    return true;
  } catch (e) {
    console.error("feedback ping failed", e);
    return false;
  }
}

