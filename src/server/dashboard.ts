import { sql } from "drizzle-orm";
import { events, users } from "@/db/schema";
import type { AnyDb } from "./board";
import { SERVER_VISITOR } from "./events";

/** The dashboard counts days in Pacific time, so "today" matches the Discord digest and Pablo's clock. */
export const DASH_TZ = "America/Los_Angeles";
/** First Pacific day with trustworthy data. The "All" range starts here. */
export const ALL_SINCE = "2026-09-29";
/** Under this many new visitors a percentage is noise, so the tile shows "n of N" instead. */
export const SMALL_BASE = 20;

export type DashRange = "7" | "30" | "all";
export const parseRange = (v: unknown): DashRange => (v === "30" || v === "all" ? v : "7");

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);
const num = (v: unknown) => Number(v ?? 0);

/** YYYY-MM-DD of an instant as seen on a Pacific wall clock. */
export function pacificDay(at: Date): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: DASH_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  return p; // en-CA gives YYYY-MM-DD
}

/** Add whole days to a YYYY-MM-DD string. Done at noon UTC so no DST shift can change the date. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type DashDay = { day: string; visitors: number; interacted: number; today: boolean };
export type DashPeriod = { visitors: number; interacted: number; newAccounts: number; kept: number; keptBase: number };
export type Dashboard = {
  range: DashRange;
  /** First and last Pacific day shown. */
  from: string;
  to: string;
  days: DashDay[];
  now: DashPeriod;
  /** The same number of days just before; null for "All". */
  before: DashPeriod | null;
  /** Visitors and accounts left out because they belong to an admin. */
  ownerVisitorsLeftOut: number;
};

const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/**
 * Everything the top of /stats needs, in Pacific days. The owner's own browsers
 * are left out: any visitor id that ever signed in as an ADMIN_EMAILS account,
 * and the account's own events.
 *
 * "Interacted" counts a visitor who changed a hero level or saved an import.
 * Merely opening the import does not count here.
 *
 * "Kept" is a new visitor (first event ever inside the period) who came back on
 * another Pacific day or signed in. Today is left out of that cohort, because
 * someone who arrived this morning has not had a chance to come back yet.
 */
export async function getDashboard(db: AnyDb, range: DashRange, now = new Date()): Promise<Dashboard> {
  const to = pacificDay(now);
  const span = range === "all" ? Math.max(1, daysBetween(ALL_SINCE, to) + 1) : Number(range);
  const from = addDays(to, -(span - 1));
  const prevFrom = addDays(from, -span);
  const admins = adminEmails();

  const adminList = admins.length ? sql.join(admins.map((e) => sql`${e}`), sql`, `) : sql`null`;
  const lowest = range === "all" ? from : prevFrom;
  // Pacific midnights as instants. A day is the half-open range [start, next start).
  const start = (d: string) => sql`((${d}::date)::timestamp at time zone ${DASH_TZ})`;
  const end = sql`${now.toISOString()}::timestamptz`;

  const base = sql`
    admin_users as (select id from ${users} where lower(email) in (${adminList})),
    admin_visitors as (
      select distinct visitor_id from ${events}
      where name = 'identify' and user_id in (select id from admin_users)
    ),
    ev as (
      select name, visitor_id, user_id, props, created_at,
        (created_at at time zone ${DASH_TZ})::date as pday
      from ${events}
      where created_at >= ${start(lowest)} and created_at <= ${end}
        and (user_id is null or user_id not in (select id from admin_users))
    ),
    real as (
      select * from ev
      where visitor_id <> ${SERVER_VISITOR} and visitor_id not in (select visitor_id from admin_visitors)
    )
  `;

  const dayRows = rowsOf(
    await db.execute(sql`
      with ${base}
      select pday::text as day,
        count(distinct visitor_id) as visitors,
        count(distinct visitor_id) filter (where name in ('level_set', 'import_save')) as interacted
      from real where pday >= ${from}::date
      group by 1 order by 1
    `),
  );
  const byDay = new Map(dayRows.map((r) => [String(r.day), r]));
  const days: DashDay[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const r = byDay.get(d);
    days.push({ day: d, visitors: num(r?.visitors), interacted: num(r?.interacted), today: d === to });
  }

  const period = async (a: string, b: string): Promise<DashPeriod> => {
    // Cohort of new visitors ends yesterday: today's arrivals have not had time to return.
    const cohortEnd = b === to ? addDays(b, -1) : b;
    const [r] = rowsOf(
      await db.execute(sql`
        with ${base},
        win as (select * from real where pday >= ${a}::date and pday <= ${b}::date),
        firsts as (
          select visitor_id, min(created_at) as first_seen from ${events}
          where visitor_id <> ${SERVER_VISITOR} and visitor_id not in (select visitor_id from admin_visitors)
            and created_at <= ${end}
          group by visitor_id
        ),
        cohort as (
          select visitor_id from firsts
          where first_seen >= ${start(a)} and first_seen < ${start(addDays(cohortEnd, 1))}
        ),
        per as (
          select c.visitor_id,
            bool_or(e.user_id is not null) as signed,
            count(distinct (e.created_at at time zone ${DASH_TZ})::date) as days
          from cohort c join ${events} e on e.visitor_id = c.visitor_id and e.created_at <= ${end}
          group by c.visitor_id
        )
        select
          (select count(distinct visitor_id) from win) as visitors,
          (select count(distinct visitor_id) from win where name in ('level_set', 'import_save')) as interacted,
          (select count(*) from ev where name = 'sign_in' and props->>'new_user' = 'true'
             and pday >= ${a}::date and pday <= ${b}::date) as new_accounts,
          (select count(*) from per) as kept_base,
          (select count(*) from per where signed or days > 1) as kept
      `),
    );
    return {
      visitors: num(r?.visitors),
      interacted: num(r?.interacted),
      newAccounts: num(r?.new_accounts),
      kept: num(r?.kept),
      keptBase: num(r?.kept_base),
    };
  };

  const [cur, prev, [left]] = await Promise.all([
    period(from, to),
    range === "all" ? Promise.resolve(null) : period(prevFrom, addDays(from, -1)),
    db
      .execute(sql`with ${base} select (select count(*) from admin_visitors) as n`)
      .then(rowsOf),
  ]);

  return { range, from, to, days, now: cur, before: prev, ownerVisitorsLeftOut: num(left?.n) };
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** "n of N" while the base is small, a percentage once it is not. */
export function keptLabel(p: Pick<DashPeriod, "kept" | "keptBase">): { big: string; note: string } {
  if (p.keptBase === 0) return { big: "n/a", note: "no new visitors yet" };
  if (p.keptBase < SMALL_BASE) return { big: `${p.kept} of ${p.keptBase}`, note: "too few new visitors for a percentage" };
  return { big: `${Math.round((p.kept / p.keptBase) * 100)}%`, note: `${p.kept} of ${p.keptBase} new visitors` };
}

/** Change against the previous period, as text and a direction. Null when there is nothing to compare. */
export function delta(now: number, before: number | null): { text: string; dir: "up" | "down" | "flat" } | null {
  if (before === null) return null;
  if (before === 0) return now === 0 ? { text: "same as before", dir: "flat" } : { text: "new, none before", dir: "up" };
  const p = Math.round(((now - before) / before) * 100);
  if (p === 0) return { text: "same as before", dir: "flat" };
  return { text: `${p > 0 ? "+" : ""}${p}% vs the ${before} before`, dir: p > 0 ? "up" : "down" };
}
