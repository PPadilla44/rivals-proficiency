import { sql } from "drizzle-orm";
import { events, publicBoards, users } from "@/db/schema";
import type { AnyDb } from "./board";
import { SERVER_VISITOR } from "./events";

const num = (v: unknown) => Number(v ?? 0);
type Row = Record<string, unknown>;
const firstRow = (r: unknown): Row => (r as { rows?: Row[] }).rows?.[0] ?? (r as Row[])[0] ?? {};

export type BoardLinkStats = {
  /** Right now, not per window. */
  linksOn: number;
  accounts: number;
  /** Players who turned a link on during the window. */
  turnedOn: number;
  /** Views of a public board by someone other than its owner, and how many different visitors. */
  views: number;
  viewers: number;
  /** Of those visitors: pressed "Track your own board", and set a level or used the import afterwards. */
  cta: number;
  started: number;
  /** Link copied or sent from the dialog, and shares of the picture that carried the link. */
  copies: number;
  phoneShares: number;
  sharesWithLink: number;
};

/** What the public board link did in a window. Visitors are anonymous ids; the owner's own views are left out. */
export async function getBoardLinkStats(db: AnyDb, since: Date, until: Date): Promise<BoardLinkStats> {
  const from = since.toISOString();
  const to = until.toISOString();
  const [on] = await db
    .select({
      linksOn: sql<number>`count(*) filter (where ${publicBoards.enabled})::int`,
    })
    .from(publicBoards);
  const [acc] = await db.select({ accounts: sql<number>`count(*)::int` }).from(users);
  const r = firstRow(
    await db.execute(sql`
      with w as (
        select * from ${events}
        where ${events.createdAt} >= ${from}::timestamptz and ${events.createdAt} <= ${to}::timestamptz
          and ${events.visitorId} <> ${SERVER_VISITOR}
      ),
      views as (
        select visitor_id, min(created_at) as first_view from w
        where name = 'board_view' and coalesce(props->>'own', 'false') <> 'true'
        group by visitor_id
      )
      select
        (select count(*) from w where name = 'board_view' and coalesce(props->>'own', 'false') <> 'true') as views,
        (select count(*) from views) as viewers,
        (select count(distinct visitor_id) from w where name = 'board_cta' and visitor_id in (select visitor_id from views)) as cta,
        (select count(*) from views v where exists (
          select 1 from ${events} e
          where e.visitor_id = v.visitor_id and e.created_at >= v.first_view
            and e.name in ('level_set', 'import_open', 'import_save')
        )) as started,
        (select count(distinct coalesce(user_id, visitor_id)) from w where name = 'board_link' and props->>'action' = 'on') as turned_on,
        (select count(*) from w where name = 'board_link' and props->>'action' = 'copy') as copies,
        (select count(*) from w where name = 'board_link' and props->>'action' = 'share') as phone_shares,
        (select count(*) from w where name = 'share' and props->>'action' = 'done' and props->>'link' = 'true') as shares_with_link
    `),
  );
  return {
    linksOn: num(on?.linksOn),
    accounts: num(acc?.accounts),
    turnedOn: num(r.turned_on),
    views: num(r.views),
    viewers: num(r.viewers),
    cta: num(r.cta),
    started: num(r.started),
    copies: num(r.copies),
    phoneShares: num(r.phone_shares),
    sharesWithLink: num(r.shares_with_link),
  };
}

/** Under this many views a day's numbers are mostly one person testing. */
export const SMALL_NUMBERS = 20;

/** "Links on 4 of 112 accounts (2 turned on) · views 18 by 11 visitors · track-your-own clicks 5 · started a board 3 · copied 6, phone shares 2, pictures shared with the link 1 (small numbers)". */
export function boardLinkLine(s: BoardLinkStats): string[] {
  const small = s.views < SMALL_NUMBERS ? " (small numbers)" : "";
  return [
    `Links on ${s.linksOn} of ${s.accounts} accounts · turned on ${s.turnedOn}`,
    `Views ${s.views} by ${s.viewers} visitor${s.viewers === 1 ? "" : "s"} · Track your own board clicks ${s.cta} · started a board after ${s.started}${small}`,
    `Link copied ${s.copies} · sent from a phone ${s.phoneShares} · pictures shared with the link ${s.sharesWithLink}`,
  ];
}
