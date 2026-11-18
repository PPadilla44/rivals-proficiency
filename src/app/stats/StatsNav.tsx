import Link from "next/link";
import type { DashRange } from "@/server/dashboard";

export type StatsTab = "overview" | "visitors" | "features" | "details";

const TABS: [StatsTab, string, string][] = [
  ["overview", "Overview", "/stats"],
  ["visitors", "Visitors", "/stats/visitors"],
  ["features", "Features", "/stats/features"],
  ["details", "Details", "/stats/details"],
];
const RANGES: [DashRange, string][] = [
  ["7", "7 days"],
  ["30", "30 days"],
  ["all", "All"],
];

const withRange = (path: string, range: DashRange) => (range === "7" ? path : `${path}?range=${range}`);

/** The page title, the tab links, and (on pages that use it) the 7 days / 30 days / All switch. All plain links. */
export function StatsNav({ active, range }: { active: StatsTab; range?: DashRange }) {
  return (
    <div className="stats-nav">
      <h1 className="page-title">Stats</h1>
      <div className="stats-nav-row">
        <nav className="dash-range" aria-label="Stats sections">
          {TABS.map(([id, text, path]) => (
            <Link key={id} href={range && id !== "details" ? withRange(path, range) : path} aria-current={active === id ? "page" : undefined} scroll={false}>
              {text}
            </Link>
          ))}
        </nav>
        {range ? (
          <nav className="dash-range" aria-label="Time range">
            {RANGES.map(([r, text]) => (
              <Link key={r} href={withRange(TABS.find(([id]) => id === active)![2], r)} aria-current={range === r ? "page" : undefined} scroll={false}>
                {text}
              </Link>
            ))}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
