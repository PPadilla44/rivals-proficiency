import { and, eq, gte, sql } from "drizzle-orm";
import { events } from "@/db/schema";
import type { AnyDb } from "./board";
import { SERVER_VISITOR, recordEvent } from "./events";
import { SITE_URL } from "@/lib/site-url";

/** Things worth knowing about before players post about them. */
export type ProblemKind =
  | "import_budget" // Anthropic spend limit or credit ran out
  | "import_site_cap" // the site-wide daily screenshot cap was reached
  | "import_failed" // the reader errored or could not be reached
  | "import_unreadable" // the reader answered but nothing usable came back
  | "unknown_hero" // an import named a hero the roster doesn't know (new season?)
  | "server_error"; // an unexpected error in a server action

export const PROBLEM_LABEL: Record<ProblemKind, string> = {
  import_budget: "Screenshot imports stopped: Anthropic spend limit or credit ran out",
  import_site_cap: "Site-wide daily screenshot cap reached",
  import_failed: "Screenshot reader failed",
  import_unreadable: "Screenshot came back unreadable",
  unknown_hero: "Import saw a hero name the roster doesn't know",
  server_error: "Server error",
};

/** How often each kind may ping the alert channel. */
const ALERT_EVERY_MS: Record<ProblemKind, number> = {
  import_budget: 60 * 60_000,
  import_site_cap: 6 * 60 * 60_000,
  import_failed: 60 * 60_000,
  import_unreadable: 6 * 60 * 60_000,
  unknown_hero: 24 * 60 * 60_000, // per name
  server_error: 60 * 60_000,
};

type Send = (content: string) => Promise<void>;

/** Post to a Discord (or Slack-compatible) incoming webhook, if one is set. */
const sendWebhook: Send = async (content) => {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Discord reads `content`, Slack reads `text`.
    body: JSON.stringify({ content, text: content }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`alert webhook ${res.status}`);
};

/** Send a one-off test message to the alert channel. Throws if it fails. */
export async function sendTestAlert(send: Send = sendWebhook): Promise<void> {
  if (!process.env.ALERT_WEBHOOK_URL && send === sendWebhook) throw new Error("ALERT_WEBHOOK_URL is not set");
  await send(`✅ Proficiency Board: test alert. Problems will post here. ${SITE_URL}/stats`);
}

/**
 * Record a problem for /stats and, at most once per window per kind, ping the
 * alert channel. Never throws: a failing alert must not break the request.
 */
export async function reportProblem(
  db: AnyDb,
  kind: ProblemKind,
  detail?: string,
  opts: { now?: Date; send?: Send } = {},
): Promise<{ alerted: boolean }> {
  const now = opts.now ?? new Date();
  const d = detail?.slice(0, 40) ?? null;
  try {
    await recordEvent(db, { name: "problem", visitorId: SERVER_VISITOR, props: { kind, detail: d }, at: now });

    const key = kind === "unknown_hero" && d ? `${kind}:${d.toLowerCase()}` : kind;
    const since = new Date(now.getTime() - ALERT_EVERY_MS[kind]);
    const [{ recent }] = await db
      .select({ recent: sql<number>`count(*)::int` })
      .from(events)
      .where(and(eq(events.name, "alert_sent"), gte(events.createdAt, since), sql`${events.props}->>'key' = ${key}`));
    if (recent > 0) return { alerted: false };

    const hour = new Date(now.getTime() - 60 * 60_000);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(events)
      .where(and(eq(events.name, "problem"), gte(events.createdAt, hour), sql`${events.props}->>'kind' = ${kind}`));

    await recordEvent(db, { name: "alert_sent", visitorId: SERVER_VISITOR, props: { kind, key }, at: now });
    const text = `⚠️ Proficiency Board: ${PROBLEM_LABEL[kind]}${d ? ` (${d})` : ""}. ${n} in the last hour. ${SITE_URL}/stats`;
    await (opts.send ?? sendWebhook)(text);
    return { alerted: true };
  } catch (e) {
    console.error("reportProblem failed", kind, e);
    return { alerted: false };
  }
}

export type ProblemRow = { kind: ProblemKind; label: string; count: number; lastAt: string; lastDetail: string | null };

/** Problems in the last `days` days, most recent first, for /stats. */
export async function getProblems(db: AnyDb, days: number, now = new Date()): Promise<ProblemRow[]> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const rows = await db.execute(sql`
    select props->>'kind' as kind, count(*)::int as count, max(created_at) as last_at,
      (array_agg(props->>'detail' order by created_at desc))[1] as last_detail
    from ${events}
    where name = 'problem' and created_at >= ${since.toISOString()}::timestamptz
    group by 1 order by max(created_at) desc
  `);
  const list = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ?? (rows as unknown as Record<string, unknown>[]);
  return list
    .filter((r) => typeof r.kind === "string" && r.kind in PROBLEM_LABEL)
    .map((r) => ({
      kind: r.kind as ProblemKind,
      label: PROBLEM_LABEL[r.kind as ProblemKind],
      count: Number(r.count ?? 0),
      lastAt: new Date(String(r.last_at)).toISOString(),
      lastDetail: (r.last_detail as string | null) ?? null,
    }));
}
