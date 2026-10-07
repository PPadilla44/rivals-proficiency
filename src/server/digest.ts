import { and, eq, gte, sql } from "drizzle-orm";
import { events, heroLevels, users } from "@/db/schema";
import { SITE_URL } from "@/lib/site-url";
import { getProblems, sendWebhook, type Send } from "./alerts";
import { countScans, type AnyDb } from "./board";
import { SERVER_VISITOR, getReferrers, getStats, recordEvent } from "./events";
import { searchSection } from "./search-console";

const DAY = 86_400_000;
/**
 * A second scheduled digest inside this window is skipped, so the route cannot
 * be used to spam the channel. Digests sent by hand from /stats do not count:
 * one sent at midday must not block the next morning's.
 */
const MIN_GAP_MS = 12 * 60 * 60_000;

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "0%");
const num = (v: unknown) => Number(v ?? 0);
type Row = Record<string, unknown>;
const rowsOf = (r: unknown): Row[] => (r as { rows?: Row[] }).rows ?? (r as Row[]);

export type Engagement = {
  /** Seen before this window started. */
  returning: number;
  /** Changed a level or used the import, without / with an account. */
  activeGuests: number;
  activeSignedIn: number;
  /** Made exactly one change and did nothing else: tried it and left. */
  oneTap: number;
  /** Updated ten or more heroes: filled in a real board. */
  deep: number;
  importOpens: number;
  importOpensFromCard: number;
  importReads: number;
  importWrongScreen: number;
  importSaves: number;
};

/** How visitors used the board in a window: who stuck, who bounced, and the import funnel. */
export async function getEngagement(db: AnyDb, since: Date, until: Date): Promise<Engagement> {
  const from = since.toISOString();
  const to = until.toISOString();
  const [v] = rowsOf(
    await db.execute(sql`
      with w as (
        select * from ${events}
        where ${events.createdAt} >= ${from}::timestamptz and ${events.createdAt} <= ${to}::timestamptz
          and ${events.visitorId} <> ${SERVER_VISITOR}
      ),
      per as (
        select visitor_id,
          bool_or(user_id is not null) as signed,
          coalesce(sum(coalesce((props->>'taps')::int, (props->>'heroes')::int, 1)) filter (where name = 'level_set'), 0) as taps,
          coalesce(sum(coalesce((props->>'heroes')::int, 1)) filter (where name = 'level_set'), 0) as heroes,
          count(*) filter (where name in ('import_open', 'import_read', 'import_save')) as imports
        from w group by visitor_id
      )
      select
        count(*) filter (where exists (
          select 1 from ${events} old where old.visitor_id = per.visitor_id and old.created_at < ${from}::timestamptz
        )) as returning,
        count(*) filter (where (taps > 0 or imports > 0) and not signed) as active_guests,
        count(*) filter (where (taps > 0 or imports > 0) and signed) as active_signed_in,
        count(*) filter (where taps = 1 and imports = 0) as one_tap,
        count(*) filter (where heroes >= 10) as deep
      from per
    `),
  );
  const [i] = rowsOf(
    await db.execute(sql`
      select
        count(*) filter (where ${events.name} = 'import_open') as opens,
        count(*) filter (where ${events.name} = 'import_open' and ${events.props}->>'from' = 'empty') as from_card,
        coalesce(sum(coalesce((${events.props}->>'screenshots')::int, 1)) filter (where ${events.name} = 'import_read'), 0) as reads,
        count(*) filter (where ${events.name} = 'import_read' and ${events.props}->>'single' = 'true') as wrong_screen,
        count(*) filter (where ${events.name} = 'import_save') as saves
      from ${events}
      where ${events.createdAt} >= ${from}::timestamptz and ${events.createdAt} <= ${to}::timestamptz
    `),
  );
  return {
    returning: num(v?.returning),
    activeGuests: num(v?.active_guests),
    activeSignedIn: num(v?.active_signed_in),
    oneTap: num(v?.one_tap),
    deep: num(v?.deep),
    importOpens: num(i?.opens),
    importOpensFromCard: num(i?.from_card),
    importReads: num(i?.reads),
    importWrongScreen: num(i?.wrong_screen),
    importSaves: num(i?.saves),
  };
}

export type NewAccount = { device: string | null; heroes: number; imports: number };

/** Accounts created in a window and what each one did. No names or emails. */
export async function getNewAccounts(db: AnyDb, since: Date, until: Date, limit = 8): Promise<NewAccount[]> {
  const list = rowsOf(
    await db.execute(sql`
      select
        (select max(d.props->>'device') from ${events} d where d.user_id = e.user_id and d.visitor_id <> ${SERVER_VISITOR}) as device,
        (select count(*) from ${heroLevels} h where h.user_id = e.user_id) as heroes,
        (select count(*) from ${events} s where s.user_id = e.user_id and s.name = 'import_save') as imports
      from ${events} e
      where e.name = 'sign_in' and e.props->>'new_user' = 'true' and e.user_id is not null
        and e.created_at >= ${since.toISOString()}::timestamptz and e.created_at <= ${until.toISOString()}::timestamptz
      order by e.created_at limit ${limit}
    `),
  );
  return list.map((r) => ({ device: (r.device as string | null) ?? null, heroes: num(r.heroes), imports: num(r.imports) }));
}

const DEVICE_LABEL: Record<string, string> = { mobile: "phone", desktop: "computer" };

/**
 * The daily summary: the last 24 hours next to the 24 hours before, grouped so
 * it reads top to bottom as traffic, behaviour, accounts, import, health.
 */
export async function buildDigest(
  db: AnyDb,
  opts: { now?: Date; cap?: number; search?: () => Promise<string[]> } = {},
): Promise<string> {
  const now = opts.now ?? new Date();
  const dayAgo = new Date(now.getTime() - DAY);
  const [search, today, before, week, refs, eng, fresh, problems, reads, [{ accounts }]] = await Promise.all([
    (opts.search ?? (() => searchSection({ now })))(),
    getStats(db, 1, now),
    getStats(db, 1, dayAgo),
    getStats(db, 7, now),
    getReferrers(db, dayAgo, now, 6),
    getEngagement(db, dayAgo, now),
    getNewAccounts(db, dayAgo, now),
    getProblems(db, 1, now),
    countScans(db, dayAgo),
    db.select({ accounts: sql<number>`count(*)::int` }).from(users),
  ]);

  const device = (d: string) => today.devices.find((x) => x.device === d)?.visitors ?? 0;
  const when = now.toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const tapsPerHero = today.levelSets ? (today.levelTaps / today.levelSets).toFixed(1) : "0";
  // Oldest first, so the trend reads left to right. Days are UTC; a 7-day window touches 8 of them, so keep the last 7.
  const trend = [...week.daily]
    .reverse()
    .map((d) => d.visitors)
    .slice(-7);

  const lines = [
    `📊 **Proficiency Board** · 24 hours to ${when} PT (previous 24 hours in brackets)`,
    ``,
    `**Traffic**`,
    `Visitors ${today.visitors} (${before.visitors}) · returning ${eng.returning} · phone ${device("mobile")}, computer ${device("desktop")}`,
    `From: ${refs.length ? refs.map((r) => `${r.ref} ${r.visitors}`).join(", ") : "not recorded yet"}`,
    `Visitors by day, last 7 (today so far is last): ${trend.length ? trend.join(", ") : "no data"}`,
    ``,
    `**What they did**`,
    `Interacted ${today.interacted}, ${pct(today.interacted, today.visitors)} (${before.interacted}, ${pct(before.interacted, before.visitors)}) · guests ${eng.activeGuests}, signed in ${eng.activeSignedIn}`,
    `One change and left ${eng.oneTap} · updated 10+ heroes ${eng.deep}`,
    `Heroes updated ${today.levelSets} (${before.levelSets}) · ${tapsPerHero} changes per hero (1.0 means typed or held, higher means repeated taps)`,
    ``,
    `**Accounts**`,
    `New ${today.newAccounts} (${before.newAccounts}) · ${accounts} in total`,
    ...fresh.map(
      (a) =>
        `• ${DEVICE_LABEL[a.device ?? ""] ?? "device unknown"}, ${a.heroes} hero${a.heroes === 1 ? "" : "es"} set${a.imports ? `, ${a.imports} import${a.imports === 1 ? "" : "s"}` : ""}`,
    ),
    ``,
    `**Import**`,
    `Opened ${eng.importOpens} (${eng.importOpensFromCard} from the card) · screenshots read ${eng.importReads} · saved ${eng.importSaves} · wrong screen ${eng.importWrongScreen} · cap ${reads}${opts.cap ? ` of ${opts.cap}` : ""}`,
    ...(search.length ? [``, ...search] : []),
    ``,
    `**Health**`,
    `Problems: ${problems.length ? problems.map((p) => `${p.label} x${p.count}`).join("; ") : "none"}`,
    `${SITE_URL}/stats`,
  ];
  // Discord refuses messages over 2,000 characters.
  return lines.join("\n").slice(0, 1990);
}

export type DigestResult = { sent: boolean; reason?: "too_soon" | "no_webhook" | "failed"; text?: string };

/**
 * Post the daily digest to the alert channel. Skipped when one already went
 * out in the last 12 hours, unless `force` (the admin button on /stats).
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
      .where(
        and(
          eq(events.name, "digest_sent"),
          gte(events.createdAt, new Date(now.getTime() - MIN_GAP_MS)),
          sql`${events.props}->>'manual' is distinct from 'true'`,
        ),
      );
    if (recent > 0) return { sent: false, reason: "too_soon" };
  }
  const text = await buildDigest(db, { now, cap: opts.cap });
  try {
    // Record first: if two requests race, the second sees this row and skips.
    await recordEvent(db, { name: "digest_sent", visitorId: SERVER_VISITOR, props: { manual: !!opts.force }, at: now });
    await (opts.send ?? sendWebhook)(text);
    return { sent: true, text };
  } catch (e) {
    console.error("daily digest failed", e);
    return { sent: false, reason: "failed", text };
  }
}
