import { createHash, timingSafeEqual } from "node:crypto";
import type { AnyDb } from "./board";
import { getCohorts, getDashboard, getSources, type CohortWeek, type DashRange, type Dashboard, type Sources } from "./dashboard";
import { getFeatures, type Features } from "./features";
import { getProblems, type ProblemRow } from "./alerts";
import type { SearchReport } from "./search-console";

/** A token shorter than this is treated as not set, so the route cannot be left guarded by a weak one. */
export const MIN_TOKEN_LENGTH = 24;

export const STATS_VIEWS = ["overview", "features", "sources", "cohorts", "problems", "search"] as const;
export type StatsView = (typeof STATS_VIEWS)[number];

/** `?view=` is one of the views, or anything else (or nothing) for all of them. */
export const parseView = (v: unknown): StatsView | "all" => ((STATS_VIEWS as readonly string[]).includes(v as string) ? (v as StatsView) : "all");

/** The configured token, or null when the route is off (unset or too short). */
export function statsToken(env: Record<string, string | undefined> = process.env): string | null {
  const t = env.STATS_TOKEN?.trim();
  return t && t.length >= MIN_TOKEN_LENGTH ? t : null;
}

/**
 * True when the Authorization header is exactly "Bearer <token>". Both sides are hashed first so the
 * comparison takes the same time whatever the lengths, and a wrong guess reveals nothing about the real token.
 */
export function tokenMatches(header: string | null, token: string): boolean {
  const given = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(token).digest();
  return timingSafeEqual(a, b) && given.length > 0;
}

export type SearchPart =
  | { state: "ok"; report: SearchReport; daily: { day: string; clicks: number; impressions: number }[] }
  | { state: "off" | "failed" };

export type AdminStats = {
  generatedAt: string;
  range: DashRange;
  /** Same rules as /stats: Pacific days, admin accounts and browsers and the server left out. */
  overview?: Dashboard;
  features?: Features;
  sources?: Sources;
  cohorts?: CohortWeek[];
  problems?: ProblemRow[];
  search?: SearchPart;
};

/**
 * The /stats numbers as one JSON object. It calls the same functions the pages do, so the owner exclusion and
 * every definition match the dashboard exactly. Everything returned is a count or a label: no emails, names or
 * visitor ids (the per-visitor pages are not part of this).
 */
export async function buildAdminStats(
  db: AnyDb,
  opts: { view: StatsView | "all"; range: DashRange; now?: Date; search?: () => Promise<SearchPart> },
): Promise<AdminStats> {
  const now = opts.now ?? new Date();
  const want = (v: StatsView) => opts.view === "all" || opts.view === v;
  const out: AdminStats = { generatedAt: now.toISOString(), range: opts.range };
  const problemDays = opts.range === "all" ? 60 : Number(opts.range);

  const jobs: Promise<void>[] = [];
  if (want("overview")) jobs.push(getDashboard(db, opts.range, now).then((d) => void (out.overview = d)));
  if (want("features")) jobs.push(getFeatures(db, opts.range, now).then((d) => void (out.features = d)));
  if (want("sources")) jobs.push(getSources(db, opts.range, now).then((d) => void (out.sources = d)));
  if (want("cohorts")) jobs.push(getCohorts(db, now).then((d) => void (out.cohorts = d)));
  if (want("problems")) jobs.push(getProblems(db, problemDays, now).then((d) => void (out.problems = d)));
  if (want("search") && opts.search) jobs.push(opts.search().then((d) => void (out.search = d)));
  await Promise.all(jobs);
  return out;
}
