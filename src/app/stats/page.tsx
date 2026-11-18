import type { Metadata } from "next";
import { getDb } from "@/db";
import { getDashboard, parseRange } from "@/server/dashboard";
import { getProblems } from "@/server/alerts";
import { countFeedback } from "@/server/feedback";
import { searchConsoleConfigured } from "@/server/search-console";
import { requireAdmin } from "./admin";
import { getCachedSearch } from "./search-cache";
import { Overview } from "./Overview";
import { StatsNav } from "./StatsNav";

export const metadata: Metadata = { title: "Stats", robots: { index: false, follow: false } };

export default async function StatsOverviewPage({ searchParams }: PageProps<"/stats">) {
  await requireAdmin();
  const range = parseRange((await searchParams).range);
  const db = getDb();
  const now = new Date();
  const configured = searchConsoleConfigured();
  const [dash, problems, feedback, search] = await Promise.all([
    getDashboard(db, range, now),
    getProblems(db, 7),
    countFeedback(db, new Date(now.getTime() - 30 * 86_400_000), now),
    configured ? getCachedSearch().catch((e): null => (console.error("dashboard search failed", e), null)) : Promise.resolve(null),
  ]);
  return (
    <div className="wrap prose-page">
      <StatsNav active="overview" range={range} />
      <Overview
        data={dash}
        problems={problems}
        search={search?.report ?? null}
        searchState={search ? "ok" : configured ? "failed" : "off"}
        feedbackCount={feedback.total}
      />
    </div>
  );
}
