import { sql } from "drizzle-orm";
import { publicBoards, users } from "@/db/schema";
import type { AnyDb } from "./board";
import { addDays, dashBase, DASH_TZ, ALL_SINCE, pacificDay, weekStart, type DashRange } from "./dashboard";

type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);
const num = (v: unknown) => Number(v ?? 0);

export type FeatureStep = { label: string; n: number };
export type FeatureWeek = { start: string; open: boolean; import: number; share: number; calc: number; link: number };

export type Features = {
  from: string;
  to: string;
  /** Visitors who reached each step inside the range; owner and server left out. */
  import: { steps: FeatureStep[]; answeredOff: number; readsTotal: number; readsFailed: number; wrongScreen: number };
  share: { steps: FeatureStep[]; ways: { share: number; save: number; copy: number }; withLink: number };
  /** heroPicked: visitors who chose a hero in the dropdown (not the one filled in from their board). */
  calc: { steps: FeatureStep[]; heroPicked: number };
  link: { steps: FeatureStep[]; views: number; linksOn: number; accounts: number };
  /** The last 8 Pacific weeks, oldest first. Each is visitors who reached the last step (link: views by friends). */
  weeks: FeatureWeek[];
};

/**
 * One card per feature: who got how far inside the range, plus a weekly strip.
 * Same rules as the rest of the dashboard: Pacific days, your own browsers and
 * the server left out. Steps are distinct visitors; the "ways" and failed reads
 * count pictures or reads, as labelled.
 */
export async function getFeatures(db: AnyDb, range: DashRange, now = new Date(), weeks = 8): Promise<Features> {
  const to = pacificDay(now);
  const span = range === "all" ? Math.max(1, Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${ALL_SINCE}T12:00:00Z`)) / 86_400_000) + 1) : Number(range);
  const from = addDays(to, -(span - 1));
  const firstWeek = addDays(weekStart(to), -7 * (weeks - 1));

  const [r] = rowsOf(
    await db.execute(sql`
      with ${dashBase(from, now)},
      win as (select * from real where pday >= ${from}::date and pday <= ${to}::date),
      friend_views as (select * from win where name = 'board_view' and coalesce(props->>'own', 'false') <> 'true'),
      viewers as (select visitor_id, min(created_at) as first_view from friend_views group by visitor_id)
      select
        count(distinct visitor_id) filter (where name = 'import_open') as imp_open,
        count(distinct visitor_id) filter (where name = 'import_read') as imp_read,
        count(distinct visitor_id) filter (where name = 'import_save') as imp_save,
        count(distinct visitor_id) filter (where name = 'import_check' and props->>'result' = 'right') as imp_right,
        count(distinct visitor_id) filter (where name = 'exact_prompt') as exact_saw,
        count(distinct visitor_id) filter (where name = 'exact_set') as exact_set,
        count(distinct visitor_id) filter (where name = 'import_check' and props->>'result' = 'off') as imp_off,
        count(*) filter (where name = 'import_read') as reads_total,
        count(*) filter (where name = 'import_read' and coalesce((props->>'failed')::int, 0) > 0) as reads_failed,
        count(*) filter (where name = 'import_read' and props->>'single' = 'true') as wrong_screen,
        count(distinct visitor_id) filter (where name = 'share' and props->>'action' = 'ready') as share_ready,
        count(distinct visitor_id) filter (where name = 'share' and props->>'action' = 'prompt') as share_prompt,
        count(distinct visitor_id) filter (where name = 'share' and props->>'action' = 'open') as share_open,
        count(distinct visitor_id) filter (where name = 'share' and props->>'action' = 'done') as share_done,
        count(*) filter (where name = 'share' and props->>'action' = 'done' and props->>'how' = 'share') as by_share,
        count(*) filter (where name = 'share' and props->>'action' = 'done' and props->>'how' = 'save') as by_save,
        count(*) filter (where name = 'share' and props->>'action' = 'done' and props->>'how' = 'copy') as by_copy,
        count(*) filter (where name = 'share' and props->>'action' = 'done' and props->>'link' = 'true') as with_link,
        count(distinct visitor_id) filter (where name = 'calc' and props->>'action' = 'view') as calc_view,
        count(distinct visitor_id) filter (where name = 'calc' and props->>'action' = 'use') as calc_use,
        count(distinct visitor_id) filter (where name = 'calc' and props->>'action' = 'hero') as calc_hero,
        count(distinct visitor_id) filter (where name = 'calc' and props->>'action' = 'box_seen') as calc_box,
        count(distinct visitor_id) filter (where name = 'calc' and props->>'action' = 'cta') as calc_cta,
        count(distinct visitor_id) filter (where name = 'calc' and props->>'action' = 'landed' and props->>'result' = 'added') as calc_landed,
        (select count(*) from (
          select visitor_id, min(created_at) as first_cta from win where name = 'calc' and props->>'action' = 'cta' group by visitor_id
        ) c where exists (
          select 1 from win e where e.visitor_id = c.visitor_id and e.created_at > c.first_cta
            and e.name in ('level_set', 'import_open', 'import_save')
        )) as calc_started,
        (select count(*) from friend_views) as link_views,
        (select count(*) from viewers) as link_viewers,
        (select count(distinct visitor_id) from win where name = 'board_cta' and visitor_id in (select visitor_id from viewers)) as link_cta,
        (select count(*) from viewers v where exists (
          select 1 from win e where e.visitor_id = v.visitor_id and e.created_at >= v.first_view
            and e.name in ('level_set', 'import_open', 'import_save')
        )) as link_started
      from win
    `),
  );

  const weekRows = rowsOf(
    await db.execute(sql`
      with ${dashBase(firstWeek, now)}
      select date_trunc('week', created_at at time zone ${DASH_TZ})::date::text as week,
        count(distinct visitor_id) filter (where name = 'import_save') as imp,
        count(distinct visitor_id) filter (where name = 'share' and props->>'action' = 'done') as shr,
        count(distinct visitor_id) filter (where name = 'calc' and props->>'action' = 'view') as calc,
        count(*) filter (where name = 'board_view' and coalesce(props->>'own', 'false') <> 'true') as link
      from real group by 1
    `),
  );
  const byWeek = new Map(weekRows.map((w) => [String(w.week), w]));
  const thisWeek = weekStart(to);
  const strip: FeatureWeek[] = [];
  for (let w = firstWeek; w <= thisWeek; w = addDays(w, 7)) {
    const x = byWeek.get(w);
    strip.push({ start: w, open: w === thisWeek, import: num(x?.imp), share: num(x?.shr), calc: num(x?.calc), link: num(x?.link) });
  }

  const [on] = await db.select({ n: sql<number>`count(*) filter (where ${publicBoards.enabled})::int` }).from(publicBoards);
  const [acc] = await db.select({ n: sql<number>`count(*)::int` }).from(users);

  const s = (label: string, key: string): FeatureStep => ({ label, n: num(r?.[key]) });
  return {
    from,
    to,
    import: {
      steps: [s("Opened Import", "imp_open"), s("Screenshots read", "imp_read"), s("Saved heroes", "imp_save"), s("Said it looked right", "imp_right"), s("Saw the exact-level prompt", "exact_saw"), s("Set an exact level", "exact_set")],
      answeredOff: num(r?.imp_off),
      readsTotal: num(r?.reads_total),
      readsFailed: num(r?.reads_failed),
      wrongScreen: num(r?.wrong_screen),
    },
    share: {
      steps: [s("Had 3 or more heroes at Lord or higher", "share_ready"), s("Saw the share prompt", "share_prompt"), s("Opened Share", "share_open"), s("Shared a picture", "share_done")],
      ways: { share: num(r?.by_share), save: num(r?.by_save), copy: num(r?.by_copy) },
      withLink: num(r?.with_link),
    },
    calc: {
      steps: [
        s("Opened the calculator", "calc_view"),
        s("Changed something", "calc_use"),
        s("Saw the board box", "calc_box"),
        s("Pressed a board button", "calc_cta"),
        s("Landed with their hero added", "calc_landed"),
        s("Then set another level or opened Import", "calc_started"),
      ],
      heroPicked: num(r?.calc_hero),
    },
    link: {
      steps: [s("Friends who opened a board link", "link_viewers"), s("Pressed Track your own board", "link_cta"), s("Then changed a hero or opened Import", "link_started")],
      views: num(r?.link_views),
      linksOn: num(on?.n),
      accounts: num(acc?.n),
    },
    weeks: strip,
  };
}
