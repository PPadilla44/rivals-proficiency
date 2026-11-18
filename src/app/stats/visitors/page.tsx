import type { Metadata } from "next";
import { getDb } from "@/db";
import { getCohorts, getDashboard, getSources, parseRange } from "@/server/dashboard";
import { searchConsoleConfigured } from "@/server/search-console";
import { requireAdmin } from "../admin";
import { getCachedSearch } from "../search-cache";
import { StatsNav } from "../StatsNav";
import { CohortsPanel, SearchPanel, SourcesPanel, StepsPanel } from "../DashboardMore";

export const metadata: Metadata = { title: "Stats: visitors", robots: { index: false, follow: false } };

const short = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

export default async function StatsVisitorsPage({ searchParams }: PageProps<"/stats/visitors">) {
  await requireAdmin();
  const range = parseRange((await searchParams).range);
  const db = getDb();
  const now = new Date();
  const configured = searchConsoleConfigured();
  const [dash, sources, cohorts, search] = await Promise.all([
    getDashboard(db, range, now),
    getSources(db, range, now),
    getCohorts(db, now),
    configured ? getCachedSearch().catch((e): null => (console.error("dashboard search failed", e), null)) : Promise.resolve(null),
  ]);
  const label = range === "all" ? `${dash.days.length} days since ${short(dash.from)}` : `last ${dash.days.length} days`;
  return (
    <div className="wrap prose-page">
      <StatsNav active="visitors" range={range} />
      <p className="muted-note">
        {short(dash.from)} to {short(dash.to)}, in Pacific days. Today is still counting. Your own visits are left out.
      </p>
      <div className="dash-grid">
        <StepsPanel p={dash.now} label={label} />
        <SourcesPanel s={sources} />
        <CohortsPanel weeks={cohorts} />
        <SearchPanel days={dash.days} search={search?.daily ?? null} state={search ? "ok" : configured ? "failed" : "off"} />
      </div>
    </div>
  );
}
