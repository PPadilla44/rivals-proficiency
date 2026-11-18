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
export type DashPeriod = {
  visitors: number;
  interacted: number;
  /** Visitors who had an account signed in at some point in the period. */
  signedIn: number;
  /** Visitors seen on two or more Pacific days inside the period. */
  returning: number;
  newAccounts: number;
  kept: number;
  keptBase: number;
};
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


/** Pacific midnight of a YYYY-MM-DD day, as an instant. */
export const pacificStart = (d: string) => sql`((${d}::date)::timestamp at time zone ${DASH_TZ})`;

/**
 * The shared CTEs: admin accounts, the browsers they signed in on, `ev` (all
 * events from Pacific midnight of `lowest` to `now`, minus the admin account's
 * own) and `real` (ev minus the server and admin browsers). Used as `with ${dashBase(...)}`.
 */
export function dashBase(lowest: string, now: Date) {
  const admins = adminEmails();
  const adminList = admins.length ? sql.join(admins.map((e) => sql`${e}`), sql`, `) : sql`null`;
  return sql`
    admin_users as (select id from ${users} where lower(email) in (${adminList})),
    admin_visitors as (
      select distinct visitor_id from ${events}
      where name = 'identify' and user_id in (select id from admin_users)
    ),
    ev as (
      select name, visitor_id, user_id, props, created_at,
        (created_at at time zone ${DASH_TZ})::date as pday
      from ${events}
      where created_at >= ${pacificStart(lowest)} and created_at <= ${now.toISOString()}::timestamptz
        and (user_id is null or user_id not in (select id from admin_users))
    ),
    real as (
      select * from ev
      where visitor_id <> ${SERVER_VISITOR} and visitor_id not in (select visitor_id from admin_visitors)
    )
  `;
}

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

  const lowest = range === "all" ? from : prevFrom;
  const base = dashBase(lowest, now);
  const end = sql`${now.toISOString()}::timestamptz`;
  const start = pacificStart;

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
          (select count(distinct visitor_id) from win where user_id is not null) as signed_in,
          (select count(*) from (select visitor_id from win group by visitor_id having count(distinct pday) > 1) r) as returning,
          (select count(*) from ev where name = 'sign_in' and props->>'new_user' = 'true'
             and pday >= ${a}::date and pday <= ${b}::date) as new_accounts,
          (select count(*) from per) as kept_base,
          (select count(*) from per where signed or days > 1) as kept
      `),
    );
    return {
      visitors: num(r?.visitors),
      interacted: num(r?.interacted),
      signedIn: num(r?.signed_in),
      returning: num(r?.returning),
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

// ---------- sources and cohorts ----------

/** The site started recording where visitors came from on this Pacific day. */
export const SOURCES_SINCE = "2026-10-06";

/** Short names for the sites that send people here; anything else shows as its own host. */
export function sourceName(ref: string | null): string {
  if (!ref) return "Not recorded";
  const h = ref.toLowerCase();
  if (h === "direct") return "Direct";
  if (/(^|\.)google\.[a-z.]+$/.test(h)) return "Google";
  if (/(^|\.)(bing\.com|duckduckgo\.com|yahoo\.com|ecosia\.org|brave\.com)$/.test(h)) return "Other search";
  if (/(^|\.)discord(app)?\.com$/.test(h) || h === "discord.gg") return "Discord";
  if (/(^|\.)reddit\.com$/.test(h) || h === "redd.it") return "Reddit";
  if (h === "t.co" || /(^|\.)(twitter|x)\.com$/.test(h)) return "X";
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return "YouTube";
  if (/(^|\.)(twitch\.tv)$/.test(h)) return "Twitch";
  return h;
}

export type SourceRow = { source: string; visitors: number; kept: number };
export type Sources = {
  from: string;
  to: string;
  total: number;
  kept: number;
  rows: SourceRow[];
};

/**
 * New visitors in the range (first event ever inside it, today left out so each
 * has had a chance to come back), grouped by the site they first arrived from,
 * with how many of each group were kept. A visitor's first-touch source is the
 * referrer on their earliest visit or calculator event; none recorded means they
 * arrived before the site recorded sources or landed on a page that does not.
 */
export async function getSources(db: AnyDb, range: DashRange, now = new Date()): Promise<Sources> {
  const today = pacificDay(now);
  const span = range === "all" ? Math.max(1, daysBetween(ALL_SINCE, today) + 1) : Number(range);
  const from = addDays(today, -(span - 1));
  const to = addDays(today, -1);
  if (to < from) return { from, to, total: 0, kept: 0, rows: [] };
  const end = sql`${now.toISOString()}::timestamptz`;
  const rows = rowsOf(
    await db.execute(sql`
      with ${dashBase(from, now)},
      firsts as (
        select visitor_id, min(created_at) as first_seen from ${events}
        where visitor_id <> ${SERVER_VISITOR} and visitor_id not in (select visitor_id from admin_visitors)
          and created_at <= ${end}
        group by visitor_id
      ),
      cohort as (
        select visitor_id from firsts
        where first_seen >= ${pacificStart(from)} and first_seen < ${pacificStart(addDays(to, 1))}
      ),
      per as (
        select c.visitor_id,
          bool_or(e.user_id is not null) as signed,
          count(distinct (e.created_at at time zone ${DASH_TZ})::date) as days,
          (array_agg(e.props->>'ref' order by e.created_at)
            filter (where e.name in ('visit', 'calc') and e.props->>'ref' is not null))[1] as ref
        from cohort c join ${events} e on e.visitor_id = c.visitor_id and e.created_at <= ${end}
        group by c.visitor_id
      )
      select ref, count(*) as visitors, count(*) filter (where signed or days > 1) as kept from per group by ref
    `),
  );
  const byName = new Map<string, SourceRow>();
  for (const r of rows) {
    const source = sourceName((r.ref as string | null) ?? null);
    const cur = byName.get(source) ?? { source, visitors: 0, kept: 0 };
    cur.visitors += num(r.visitors);
    cur.kept += num(r.kept);
    byName.set(source, cur);
  }
  const list = [...byName.values()].sort((a, b) => b.visitors - a.visitors || a.source.localeCompare(b.source));
  // "Not recorded" always last, whatever its size.
  list.sort((a, b) => Number(a.source === "Not recorded") - Number(b.source === "Not recorded"));
  return { from, to, total: list.reduce((n, r) => n + r.visitors, 0), kept: list.reduce((n, r) => n + r.kept, 0), rows: list };
}

export type CohortWeek = { start: string; visitors: number; kept: number; open: boolean };

/** Monday of the Pacific week a YYYY-MM-DD day falls in. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

/**
 * The last `weeks` Pacific weeks (Monday to Sunday): new visitors first seen in
 * each, and how many of them came back on another day or signed in, counted up
 * to now. The current week is marked open and leaves today out. Weeks before the
 * first recorded visitor are dropped.
 */
export async function getCohorts(db: AnyDb, now = new Date(), weeks = 8): Promise<CohortWeek[]> {
  const today = pacificDay(now);
  const thisWeek = weekStart(today);
  const first = addDays(thisWeek, -7 * (weeks - 1));
  const end = sql`${now.toISOString()}::timestamptz`;
  const rows = rowsOf(
    await db.execute(sql`
      with ${dashBase(first, now)},
      firsts as (
        select visitor_id, min(created_at) as first_seen from ${events}
        where visitor_id <> ${SERVER_VISITOR} and visitor_id not in (select visitor_id from admin_visitors)
          and created_at <= ${end}
        group by visitor_id
      ),
      cohort as (
        select visitor_id, date_trunc('week', first_seen at time zone ${DASH_TZ})::date::text as week from firsts
        where first_seen >= ${pacificStart(first)} and first_seen < ${pacificStart(today)}
      ),
      per as (
        select c.week, c.visitor_id,
          bool_or(e.user_id is not null) as signed,
          count(distinct (e.created_at at time zone ${DASH_TZ})::date) as days
        from cohort c join ${events} e on e.visitor_id = c.visitor_id and e.created_at <= ${end}
        group by c.week, c.visitor_id
      )
      select week, count(*) as visitors, count(*) filter (where signed or days > 1) as kept from per group by week
    `),
  );
  const by = new Map(rows.map((r) => [String(r.week), r]));
  const out: CohortWeek[] = [];
  for (let w = first; w <= thisWeek; w = addDays(w, 7)) {
    const r = by.get(w);
    out.push({ start: w, visitors: num(r?.visitors), kept: num(r?.kept), open: w === thisWeek });
  }
  while (out.length && out[0].visitors === 0) out.shift();
  return out;
}
