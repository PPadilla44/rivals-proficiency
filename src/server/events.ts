import { and, eq, sql } from "drizzle-orm";
import { events } from "@/db/schema";
import type { AnyDb } from "./board";

/** Events the site records. Anything else is dropped. */
export const EVENT_NAMES = ["visit", "level_set", "import_open", "import_read", "import_save", "sign_in", "identify", "ab", "example_start", "calc", "problem", "alert_sent", "digest_sent"] as const;
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
  // "ab" records which half of a test a browser is in; one row per browser and test, first answer wins.
  if (e.name === "ab") {
    const seen = await db
      .select({ id: events.id })
      .from(events)
      .where(
        and(
          eq(events.name, "ab"),
          eq(events.visitorId, e.visitorId),
          sql`${events.props}->>'exp' is not distinct from ${String((e.props as { exp?: unknown } | null)?.exp ?? "")}`,
        ),
      )
      .limit(1);
    if (seen.length) return false;
  }
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

/**
 * Ceilings on events sent from browsers, per hour. Anyone can call the tracking
 * action, so without these a script could fill the database with fake events.
 * Real use is far below both: a busy visitor sends about one event a minute.
 */
export const EVENT_LIMITS = { visitorPerHour: 300, sitePerHour: 10_000 };

export type EventCeiling =
  | "ok"
  | "visitor" // this browser id is over its hourly limit
  | "site" // the whole site is over its hourly limit (already reported this hour)
  | "site_first"; // the site limit was just reached: report it once

/** Whether one more browser event may be recorded right now. */
export async function eventCeiling(db: AnyDb, visitorId: string, now = new Date()): Promise<EventCeiling> {
  const since = new Date(now.getTime() - 3_600_000);
  const rows = await db.execute(sql`
    select
      count(*) filter (where ${events.visitorId} <> ${SERVER_VISITOR}) as total,
      count(*) filter (where ${events.visitorId} = ${visitorId}) as mine,
      count(*) filter (where ${events.name} = 'problem' and ${events.props}->>'kind' = 'event_flood') as flagged
    from ${events}
    where ${events.createdAt} >= ${since.toISOString()}::timestamptz and ${events.createdAt} <= ${now.toISOString()}::timestamptz
  `);
  const r = (rows as unknown as { rows?: Record<string, unknown>[] }).rows?.[0] ?? (rows as unknown as Record<string, unknown>[])[0];
  if (Number(r?.total ?? 0) >= EVENT_LIMITS.sitePerHour) return Number(r?.flagged ?? 0) > 0 ? "site" : "site_first";
  if (Number(r?.mine ?? 0) >= EVENT_LIMITS.visitorPerHour) return "visitor";
  return "ok";
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
  /** Every single change, counting each button tap. Equals levelSets for events before October 5, 2026. */
  levelTaps: number;
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
    with e as (select * from ${events} where ${events.createdAt} >= ${since.toISOString()}::timestamptz and ${events.createdAt} <= ${now.toISOString()}::timestamptz)
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
      (select coalesce(sum(coalesce((props->>'taps')::int, (props->>'heroes')::int, 1)), 0) from e where name = 'level_set') as level_taps,
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
    from ${events} where ${events.createdAt} >= ${since.toISOString()}::timestamptz and ${events.createdAt} <= ${now.toISOString()}::timestamptz
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
    where ${events.createdAt} >= ${since.toISOString()}::timestamptz and ${events.createdAt} <= ${now.toISOString()}::timestamptz
      and ${events.props}->>'device' in ('mobile', 'desktop')
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
    levelTaps: n(r?.level_taps),
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

export type Referrer = { ref: string; visitors: number };

/**
 * Where visitors came from in a window, by the site they arrived from
 * ("direct" when there was none). Only visits recorded with a referrer count.
 */
export async function getReferrers(db: AnyDb, since: Date, until = new Date(), limit = 8): Promise<Referrer[]> {
  const rows = await db.execute(sql`
    select ${events.props}->>'ref' as ref, count(distinct ${events.visitorId}) as visitors
    from ${events}
    where ${events.name} in ('visit', 'calc') and ${events.props}->>'ref' is not null
      and ${events.createdAt} >= ${since.toISOString()}::timestamptz and ${events.createdAt} <= ${until.toISOString()}::timestamptz
    group by 1 order by 2 desc, 1 limit ${limit}
  `);
  const list = (rows as unknown as { rows?: Record<string, unknown>[] }).rows ?? (rows as unknown as Record<string, unknown>[]);
  return list.map((r) => ({ ref: String(r.ref), visitors: n(r.visitors) }));
}

/** Referrers for the last `days` days. */
export function getRecentReferrers(db: AnyDb, days: number, limit = 8, now = new Date()): Promise<Referrer[]> {
  return getReferrers(db, new Date(now.getTime() - days * 86_400_000), now, limit);
}
