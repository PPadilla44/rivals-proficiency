import { and, eq, sql } from "drizzle-orm";
import { events } from "@/db/schema";
import type { AnyDb } from "./board";

/** Events the site records. Anything else is dropped. */
export const EVENT_NAMES = ["visit", "level_set", "import_open", "import_read", "import_save", "sign_in", "identify", "problem", "alert_sent"] as const;
export type EventName = (typeof EVENT_NAMES)[number];

export type EventProps = Record<string, string | number | boolean | null>;

const NAMES = new Set<string>(EVENT_NAMES);

/** Visitor id for events recorded by the server itself (sign-ins). */
export const SERVER_VISITOR = "server-auth";

/** Keep props small and flat: at most 6 keys, short keys, primitive values. */
export function cleanProps(input: unknown): EventProps | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: EventProps = {};
  for (const [k, v] of Object.entries(input).slice(0, 6)) {
    if (!/^[a-z_]{1,24}$/.test(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 40);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean" || v === null) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

export function isVisitorId(v: unknown): v is string {
  return typeof v === "string" && /^[A-Za-z0-9-]{8,64}$/.test(v);
}

export async function recordEvent(
  db: AnyDb,
  e: { name: string; visitorId: string; userId?: string | null; props?: unknown; at?: Date },
): Promise<boolean> {
  if (!NAMES.has(e.name) || !isVisitorId(e.visitorId)) return false;
  // "identify" ties a browser to the account signed in on it; one row per pair.
  if (e.name === "identify") {
    if (!e.userId) return false;
    const seen = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.name, "identify"), eq(events.visitorId, e.visitorId), eq(events.userId, e.userId)))
      .limit(1);
    if (seen.length) return false;
  }
  await db.insert(events).values({
    name: e.name,
    visitorId: e.visitorId,
    userId: e.userId ?? null,
    props: cleanProps(e.props),
    ...(e.at ? { createdAt: e.at } : {}),
  });
  return true;
}

export type Stats = {
  days: number;
  visitors: number;
  interacted: number;
  signedInVisitors: number;
  returning: number;
  signIns: number;
  newAccounts: number;
  levelSets: number;
  importsSaved: number;
  screenshotsRead: number;
  daily: { day: string; visitors: number; interacted: number; levelSets: number; importsSaved: number }[];
  /** Split by phone or computer. Only events recorded with a device are counted. */
  devices: { device: string; visitors: number; interacted: number; signedIn: number; levelSets: number }[];
};

const n = (v: unknown) => Number(v ?? 0);

/** Counts for the last `days` days (UTC). */
export async function getStats(db: AnyDb, days: number, now = new Date()): Promise<Stats> {
  const since = new Date(now.getTime() - days * 86_400_000);
  const rows = await db.execute(sql`
    with e as (select * from ${events} where ${events.createdAt} >= ${since.toISOString()}::timestamptz)
    select
      (select count(distinct visitor_id) from e where visitor_id <> 'server-auth') as visitors,
      (select count(distinct visitor_id) from e where name in ('level_set', 'import_open', 'import_save')) as interacted,
      (select count(distinct visitor_id) from e where user_id is not null and visitor_id <> 'server-auth') as signed_in_visitors,
      (select count(*) from (
        select visitor_id from e where visitor_id <> 'server-auth'
        group by visitor_id having count(distinct date_trunc('day', created_at)) > 1
      ) r) as returning,
      (select count(*) from e where name = 'sign_in') as sign_ins,
      (select count(*) from e where name = 'sign_in' and props->>'new_user' = 'true') as new_accounts,
      (select coalesce(sum(coalesce((props->>'heroes')::int, 1)), 0) from e where name = 'level_set') as level_sets,
      (select count(*) from e where name = 'import_save') as imports_saved,
      (select coalesce(sum(coalesce((props->>'screenshots')::int, 1)), 0) from e where name = 'import_read') as screenshots_read
  `);
  const r = (rows as unknown as { rows?: Record<string, unknown>[] }).rows?.[0] ?? (rows as unknown as Record<string, unknown>[])[0];

  const dailyRows = await db.execute(sql`
    select to_char(date_trunc('day', ${events.createdAt}), 'YYYY-MM-DD') as day,
      count(distinct ${events.visitorId}) filter (where ${events.visitorId} <> 'server-auth') as visitors,
      count(distinct ${events.visitorId}) filter (where ${events.name} in ('level_set', 'import_open', 'import_save')) as interacted,
      coalesce(sum(coalesce((${events.props}->>'heroes')::int, 1)) filter (where ${events.name} = 'level_set'), 0) as level_sets,
      count(*) filter (where ${events.name} = 'import_save') as imports_saved
    from ${events} where ${events.createdAt} >= ${since.toISOString()}::timestamptz
    group by 1 order by 1 desc
  `);
  const list = (dailyRows as unknown as { rows?: Record<string, unknown>[] }).rows ?? (dailyRows as unknown as Record<string, unknown>[]);

  const deviceRows = await db.execute(sql`
    select ${events.props}->>'device' as device,
      count(distinct ${events.visitorId}) as visitors,
      count(distinct ${events.visitorId}) filter (where ${events.name} in ('level_set', 'import_open', 'import_save')) as interacted,
      count(distinct ${events.visitorId}) filter (where ${events.userId} is not null) as signed_in,
      coalesce(sum(coalesce((${events.props}->>'heroes')::int, 1)) filter (where ${events.name} = 'level_set'), 0) as level_sets
    from ${events}
    where ${events.createdAt} >= ${since.toISOString()}::timestamptz and ${events.props}->>'device' in ('mobile', 'desktop')
    group by 1 order by 1
  `);
  const deviceList =
    (deviceRows as unknown as { rows?: Record<string, unknown>[] }).rows ?? (deviceRows as unknown as Record<string, unknown>[]);

  return {
    devices: deviceList.map((d) => ({
      device: String(d.device),
      visitors: n(d.visitors),
      interacted: n(d.interacted),
      signedIn: n(d.signed_in),
      levelSets: n(d.level_sets),
    })),
    days,
    visitors: n(r?.visitors),
    interacted: n(r?.interacted),
    signedInVisitors: n(r?.signed_in_visitors),
    returning: n(r?.returning),
    signIns: n(r?.sign_ins),
    newAccounts: n(r?.new_accounts),
    levelSets: n(r?.level_sets),
    importsSaved: n(r?.imports_saved),
    screenshotsRead: n(r?.screenshots_read),
    daily: list.map((d) => ({
      day: String(d.day),
      visitors: n(d.visitors),
      interacted: n(d.interacted),
      levelSets: n(d.level_sets),
      importsSaved: n(d.imports_saved),
    })),
  };
}
