import Link from "next/link";
import type { ReactNode } from "react";
import { delta, keptLabel, type CohortWeek, type DashDay, type DashRange, type Dashboard as Data, type Sources } from "@/server/dashboard";
import type { ProblemRow } from "@/server/alerts";
import type { SearchDay, SearchReport } from "@/server/search-console";
import { CohortsPanel, SearchPanel, SourcesPanel, StepsPanel } from "./DashboardMore";

const RANGES: [DashRange, string][] = [
  ["7", "7 days"],
  ["30", "30 days"],
  ["all", "All"],
];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const short = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

function Delta({ text, dir }: { text: string; dir: "up" | "down" | "flat" }) {
  return (
    <small className="dash-delta">
      <span aria-hidden="true">{dir === "up" ? "▲" : dir === "down" ? "▼" : "•"}</span> {text}
    </small>
  );
}

function Tile({ label, big, note, change }: { label: string; big: ReactNode; note?: ReactNode; change?: { text: string; dir: "up" | "down" | "flat" } | null }) {
  return (
    <div className="dash-tile">
      <span>{label}</span>
      <b>{big}</b>
      {change ? <Delta {...change} /> : null}
      {note ? <small>{note}</small> : null}
    </div>
  );
}

/** Top of the y axis: four even steps that are 1, 2, 2.5, 3, 4, 5, 6 or 8 times a power of ten. */
function niceMax(v: number): number {
  if (v <= 4) return 4;
  const mag = 10 ** Math.floor(Math.log10(v / 4));
  for (const m of [1, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * mag * 4 >= v) return m * mag * 4;
  return 40 * mag;
}

type Variant = { w: number; h: number; left: number; right: number; top: number; bottom: number; font: number; maxLabels: number };
const WIDE: Variant = { w: 1000, h: 280, left: 34, right: 100, top: 14, bottom: 30, font: 12, maxLabels: 10 };
const NARROW: Variant = { w: 360, h: 260, left: 30, right: 92, top: 14, bottom: 32, font: 13, maxLabels: 3 };

function Chart({ days, v, id }: { days: DashDay[]; v: Variant; id: string }) {
  const n = days.length;
  const max = niceMax(Math.max(1, ...days.map((d) => d.visitors)));
  const iw = v.w - v.left - v.right;
  const ih = v.h - v.top - v.bottom;
  const x = (i: number) => v.left + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (val: number) => v.top + ih - (val / max) * ih;
  const ticks = [0, 1, 2, 3, 4].map((k) => (max / 4) * k);
  const step = Math.max(1, Math.ceil(n / v.maxLabels));

  const path = (key: "visitors" | "interacted", from: number, to: number) =>
    days
      .slice(from, to + 1)
      .map((d, k) => `${k ? "L" : "M"}${x(from + k).toFixed(1)} ${y(d[key]).toFixed(1)}`)
      .join(" ");

  // Today is partial, so its last segment is dotted rather than solid.
  const hasToday = n > 1 && days[n - 1].today;
  const solidTo = hasToday ? n - 2 : n - 1;
  const last = days[n - 1];
  let yv = y(last.visitors);
  let yi = y(last.interacted);
  if (Math.abs(yv - yi) < v.font + 4) {
    const mid = (yv + yi) / 2;
    const gap = (v.font + 4) / 2;
    if (yv <= yi) {
      yv = mid - gap;
      yi = mid + gap;
    } else {
      yv = mid + gap;
      yi = mid - gap;
    }
  }

  return (
    <svg viewBox={`0 0 ${v.w} ${v.h}`} className="dash-svg" role="img" aria-labelledby={`${id}-t`} focusable="false">
      <title id={`${id}-t`}>
        {`Visitors and interacted visitors per day, ${short(days[0].day)} to ${short(last.day)}. Latest day: ${last.visitors} visitors, ${last.interacted} interacted. The numbers are in the table below the chart.`}
      </title>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={v.left} x2={v.left + iw} y1={y(t)} y2={y(t)} className={t === 0 ? "dash-axis" : "dash-grid"} />
          <text x={v.left - 6} y={y(t) + 4} textAnchor="end" className="dash-tick" fontSize={v.font}>
            {Number.isInteger(t) ? t : t.toFixed(1)}
          </text>
        </g>
      ))}
      {days.map((d, i) =>
        (n - 1 - i) % step === 0 ? (
          <text key={d.day} x={x(i)} y={v.h - 8} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} className="dash-tick" fontSize={v.font}>
            {short(d.day)}
          </text>
        ) : null,
      )}
      <path d={path("visitors", 0, solidTo)} className="dash-line dash-visitors" />
      <path d={path("interacted", 0, solidTo)} className="dash-line dash-interacted" />
      {hasToday ? (
        <>
          <path d={path("visitors", n - 2, n - 1)} className="dash-line dash-visitors dash-partial" />
          <path d={path("interacted", n - 2, n - 1)} className="dash-line dash-interacted dash-partial" />
        </>
      ) : null}
      <circle cx={x(n - 1)} cy={y(last.visitors)} r="4" className={`dash-dot dash-visitors-fill${hasToday ? " hollow" : ""}`} />
      <circle cx={x(n - 1)} cy={y(last.interacted)} r="4" className={`dash-dot dash-interacted-fill${hasToday ? " hollow" : ""}`} />
      <text x={x(n - 1) + 10} y={yv + 4} className="dash-end dash-visitors-text" fontSize={v.font}>
        Visitors {last.visitors}
      </text>
      <text x={x(n - 1) + 10} y={yi + 4} className="dash-end dash-interacted-text" fontSize={v.font}>
        Interacted {last.interacted}
      </text>
    </svg>
  );
}

export function Dashboard({
  data,
  problems,
  search,
  searchDaily,
  searchState,
  sources,
  cohorts,
}: {
  data: Data;
  problems: ProblemRow[];
  search: SearchReport | null;
  searchDaily: SearchDay[] | null;
  searchState: "ok" | "off" | "failed";
  sources: Sources;
  cohorts: CohortWeek[];
}) {
  const { now, before, days } = data;
  const rate = pct(now.interacted, now.visitors);
  const beforeRate = before ? pct(before.interacted, before.visitors) : null;
  const kept = keptLabel(now);
  const span = days.length;
  const label = data.range === "all" ? `${span} days since ${short(data.from)}` : `last ${span} days`;
  const totalProblems = problems.reduce((a, p) => a + p.count, 0);

  return (
    <section className="dash" aria-labelledby="dash-h">
      <div className="dash-head">
        <div>
          <h2 id="dash-h">How it&apos;s going</h2>
          <p className="muted-note">
            {short(data.from)} to {short(data.to)}, in Pacific days. Today is still counting. Your own visits are left out.
          </p>
        </div>
        <nav className="dash-range" aria-label="Time range">
          {RANGES.map(([r, text]) => (
            <Link key={r} href={r === "7" ? "/stats" : `/stats?range=${r}`} aria-current={data.range === r ? "page" : undefined} scroll={false}>
              {text}
            </Link>
          ))}
        </nav>
      </div>

      {problems.length ? (
        <details className="dash-problems">
          <summary>
            <b>
              {totalProblems} problem{totalProblems === 1 ? "" : "s"} in the last 7 days
            </b>
            <span>{problems.map((p) => `${p.label} ×${p.count}`).join(", ")}</span>
          </summary>
          <ul>
            {problems.map((p) => (
              <li key={p.kind}>
                <b>{p.label}</b> ×{p.count}, last {p.lastAt.slice(0, 16).replace("T", " ")} UTC{p.lastDetail ? `: ${p.lastDetail}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="dash-tiles">
        <Tile label="Visitors" big={now.visitors} change={delta(now.visitors, before?.visitors ?? null)} note={label} />
        <Tile
          label="Interacted"
          big={`${rate}%`}
          note={`${now.interacted} of ${now.visitors} changed a hero or saved an import${beforeRate !== null ? `. Was ${beforeRate}% before.` : ""}`}
        />
        <Tile label="New accounts" big={now.newAccounts} change={delta(now.newAccounts, before?.newAccounts ?? null)} note="first sign-ins" />
        <Tile label="Kept" big={kept.big} note={`${kept.note}. Came back on another day or signed in. Target about 10%.`} />
        <Tile
          label="Google clicks"
          big={search ? search.now.clicks : "n/a"}
          change={search ? delta(search.now.clicks, search.before.clicks) : null}
          note={
            search
              ? `7 days to ${short(search.to)}. Google reports 2 to 3 days late, so this never matches the range.`
              : searchState === "off"
                ? "Search Console is not connected."
                : "Google did not answer. Reload to try again."
          }
        />
      </div>

      <div className="dash-chart">
        <div className="dash-legend" aria-hidden="true">
          <span className="dash-key dash-key-v">Visitors</span>
          <span className="dash-key dash-key-i">Interacted</span>
          <span className="dash-key dash-key-p">Today so far</span>
        </div>
        <div className="dash-wide">
          <Chart days={days} v={WIDE} id="dw" />
        </div>
        <div className="dash-narrow">
          <Chart days={days} v={NARROW} id="dn" />
        </div>
        <details className="dash-numbers">
          <summary>Show the numbers</summary>
          <div className="table-scroll">
            <table className="rank-table">
              <thead>
                <tr>
                  <th scope="col">Day (Pacific)</th>
                  <th scope="col">Visitors</th>
                  <th scope="col">Interacted</th>
                </tr>
              </thead>
              <tbody>
                {[...days].reverse().map((d) => (
                  <tr key={d.day}>
                    <th scope="row">
                      {short(d.day)}
                      {d.today ? " (so far)" : ""}
                    </th>
                    <td>{d.visitors}</td>
                    <td>{d.interacted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="dash-grid">
        <StepsPanel p={now} label={label} />
        <SourcesPanel s={sources} />
        <CohortsPanel weeks={cohorts} />
        <SearchPanel days={days} search={searchDaily} state={searchState} />
      </div>
    </section>
  );
}
