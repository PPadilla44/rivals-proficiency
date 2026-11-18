import type { Metadata } from "next";
import { getDb } from "@/db";
import { parseRange } from "@/server/dashboard";
import { getFeatures } from "@/server/features";
import { requireAdmin } from "../admin";
import { FeatureCards } from "../FeatureCards";
import { StatsNav } from "../StatsNav";

export const metadata: Metadata = { title: "Stats: features", robots: { index: false, follow: false } };

const short = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

export default async function StatsFeaturesPage({ searchParams }: PageProps<"/stats/features">) {
  await requireAdmin();
  const range = parseRange((await searchParams).range);
  const f = await getFeatures(getDb(), range, new Date());
  return (
    <div className="wrap prose-page">
      <StatsNav active="features" range={range} />
      <p className="muted-note">
        {short(f.from)} to {short(f.to)}, in Pacific days. Today is still counting. Your own visits are left out, so these can differ a little from the daily
        Discord digest, which uses the last 24 hours and counts everyone. The weekly strips always show the last 8 weeks.
      </p>
      <FeatureCards f={f} />
    </div>
  );
}
