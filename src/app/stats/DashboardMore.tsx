import { addDays, keptLabel, SMALL_BASE, SOURCES_SINCE, type CohortWeek, type DashDay, type DashPeriod, type Sources } from "@/server/dashboard";
import type { SearchDay } from "@/server/search-console";

const short = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

function Bar({ value, total, tone = "gold" }: { value: number; total: number; tone?: "gold" | "purple" }) {
  return (
    <span className="dash-bar" aria-hidden="true">
      <span className={`dash-bar-fill ${tone}`} style={{ width: `${Math.min(100, pct(value, total))}%` }} />
    </span>
  );
}

export function StepsPanel({ p, label }: { p: DashPeriod; label: string }) {
  const steps: [string, number][] = [
    ["Visited", p.visitors],
    ["Changed a hero or saved an import", p.interacted],
    ["Signed in", p.signedIn],
    ["Came back on another day", p.returning],
  ];
  return (
    <section className="dash-card" aria-labelledby="dash-steps-h">
      <h3 id="dash-steps-h">What visitors did</h3>
      <p className="muted-note">Share of the {p.visitors} visitors in the {label}. These are steps, not a strict funnel: a guest can come back without signing in.</p>
      <ul className="dash-steps">
        {steps.map(([name, n]) => (
          <li key={name}>
            <span className="dash-step-name">{name}</span>
            <Bar value={n} total={p.visitors} />
            <b>
              {pct(n, p.visitors)}%<small> {n}</small>
            </b>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SourcesPanel({ s }: { s: Sources }) {
  const noneYet = s.rows.length === 0;
  return (
    <section className="dash-card" aria-labelledby="dash-src-h">
      <h3 id="dash-src-h">Where new visitors first came from</h3>
      <p className="muted-note">
        New visitors {short(s.from)} to {short(s.to)}; today is left out so each has had a chance to come back. &ldquo;Kept&rdquo; means came back on another day or
        signed in. Sources are recorded from {short(SOURCES_SINCE)}, and only for people who land on the board page.
      </p>
      {noneYet ? (
        <p className="muted-note">No new visitors in this range yet.</p>
      ) : (
        <div className="table-scroll">
          <table className="rank-table dash-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">New visitors</th>
                <th scope="col">Kept</th>
              </tr>
            </thead>
            <tbody>
              {s.rows.map((r) => {
                const k = keptLabel({ kept: r.kept, keptBase: r.visitors });
                return (
                  <tr key={r.source}>
                    <th scope="row">{r.source}</th>
                    <td>
                      <span className="dash-cell">
                        <Bar value={r.visitors} total={s.total} />
                        <span>
                          {r.visitors}
                          <small> {pct(r.visitors, s.total)}%</small>
                        </span>
                      </span>
                    </td>
                    <td>{r.visitors < SMALL_BASE ? `${r.kept} of ${r.visitors}` : k.big}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">All</th>
                <td>{s.total}</td>
                <td>{s.total < SMALL_BASE ? `${s.kept} of ${s.total}` : `${pct(s.kept, s.total)}%`}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

export function CohortsPanel({ weeks }: { weeks: CohortWeek[] }) {
  return (
    <section className="dash-card" aria-labelledby="dash-coh-h">
      <h3 id="dash-coh-h">Do new visitors stay? By week</h3>
      <p className="muted-note">
        New visitors who first came that week (Monday to Sunday, Pacific), and how many came back on another day or signed in. Target about 10%.
        The current week is still open.
      </p>
      {weeks.length ? (
        <ul className="dash-weeks">
          {weeks.map((w) => {
            const small = w.visitors < SMALL_BASE;
            return (
              <li key={w.start}>
                <span className="dash-week-name">
                  {short(w.start)}
                  {w.open ? " (so far)" : ""}
                </span>
                <Bar value={w.kept} total={w.visitors} tone="purple" />
                <b>
                  {small ? `${w.kept} of ${w.visitors}` : `${pct(w.kept, w.visitors)}%`}
                  {small ? null : <small> {w.kept} of {w.visitors}</small>}
                </b>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted-note">No new visitors recorded yet.</p>
      )}
    </section>
  );
}

const W = 520;
const H = 190;

export function SearchPanel({ days, search, state }: { days: DashDay[]; search: SearchDay[] | null; state: "ok" | "off" | "failed" }) {
  if (!search) {
    return (
      <section className="dash-card" aria-labelledby="dash-gsc-h">
        <h3 id="dash-gsc-h">Google clicks per day</h3>
        <p className="muted-note">{state === "off" ? "Search Console is not connected." : "Google did not answer. Reload to try again."}</p>
      </section>
    );
  }
  // Google reports a few days late, so a 7-day range alone would show two or three bars. Always show at least 30 days.
  const n = Math.min(60, Math.max(30, days.length));
  const end = days[days.length - 1].day;
  days = Array.from({ length: n }, (_, i) => ({ day: addDays(end, -(n - 1 - i)), visitors: 0, interacted: 0, today: false }));
  const by = new Map(search.map((d) => [d.day, d]));
  const last = search.at(-1)?.day ?? "";
  const rows = days.map((d) => ({ day: d.day, clicks: by.get(d.day)?.clicks ?? 0, reported: d.day <= last }));
  const total = rows.reduce((n, r) => n + r.clicks, 0);
  const rawMax = Math.max(1, ...rows.map((r) => r.clicks));
  const max = rawMax <= 4 ? 4 : Math.ceil(rawMax / 4) * 4;
  const left = 28;
  const top = 10;
  const bottom = 26;
  const iw = W - left - 6;
  const ih = H - top - bottom;
  const slot = iw / rows.length;
  const bw = Math.max(2, Math.min(28, slot * 0.7));
  const step = Math.max(1, Math.ceil(rows.length / 6));
  const unreported = rows.filter((r) => !r.reported).length;
  return (
    <section className="dash-card" aria-labelledby="dash-gsc-h">
      <h3 id="dash-gsc-h">Google clicks per day</h3>
      <p className="muted-note">
        {total} clicks in the days Google has reported
        {unreported ? `. The last ${unreported} day${unreported === 1 ? "" : "s"} (hatched) are not reported yet.` : "."}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="dash-svg" role="img" aria-labelledby="dash-gsc-t" focusable="false">
        <title id="dash-gsc-t">{`Google search clicks per day, ${short(rows[0].day)} to ${short(rows[rows.length - 1].day)}: ${total} in total.`}</title>
        <defs>
          <pattern id="dash-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="dash-hatch-line" />
          </pattern>
        </defs>
        {[0, 1, 2, 3, 4].map((k) => {
          const v = (max / 4) * k;
          const y = top + ih - (v / max) * ih;
          return (
            <g key={k}>
              <line x1={left} x2={W - 6} y1={y} y2={y} className={k === 0 ? "dash-axis" : "dash-grid"} />
              <text x={left - 5} y={y + 4} textAnchor="end" className="dash-tick" fontSize="11">
                {v}
              </text>
            </g>
          );
        })}
        {rows.map((r, i) => {
          const x = left + i * slot + (slot - bw) / 2;
          const h = (r.clicks / max) * ih;
          return r.reported ? (
            r.clicks ? <rect key={r.day} x={x} y={top + ih - h} width={bw} height={h} rx="1.5" className="dash-gsc-bar" /> : null
          ) : (
            <rect key={r.day} x={x} y={top} width={bw} height={ih} fill="url(#dash-hatch)" />
          );
        })}
        {rows.map((r, i) =>
          (rows.length - 1 - i) % step === 0 ? (
            <text key={r.day} x={left + i * slot + slot / 2} y={H - 8} textAnchor={i === rows.length - 1 ? "end" : "middle"} className="dash-tick" fontSize="11">
              {short(r.day)}
            </text>
          ) : null,
        )}
      </svg>
    </section>
  );
}
