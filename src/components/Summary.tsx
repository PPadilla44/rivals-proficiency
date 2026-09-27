import { CHAMPION, LORD, RANKS, formatHours, tierOf } from "@/lib/proficiency";
import type { HeroRow } from "@/lib/board-model";

export const tierColor = (t: number) => `var(--t${t})`;

type Props = {
  rows: HeroRow[];
  activeRank: number | null;
  onRank: (tier: number) => void;
  linked: boolean;
};

export function Summary({ rows, activeRank, onRank, linked }: Props) {
  const counts = Array(RANKS.length).fill(0) as number[];
  let sum = 0;
  for (const r of rows) {
    counts[tierOf(r.effective)]++;
    sum += r.effective;
  }
  const lord = rows
    .filter((r) => r.effective > 1 && r.effective < LORD)
    .sort((a, b) => b.effective - a.effective || (a.hoursToNext ?? 0) - (b.hoursToNext ?? 0))
    .slice(0, 5);
  const champ = rows
    .filter((r) => r.effective >= LORD && r.effective < CHAMPION)
    .sort((a, b) => b.effective - a.effective || (a.hoursToNext ?? 0) - (b.hoursToNext ?? 0))
    .slice(0, 5);

  return (
    <section className="summary" aria-label="Overview">
      <div className="panel dist">
        <h2>
          Roster by rank <b>avg Lv {(sum / rows.length).toFixed(1)}</b>
        </h2>
        <div className="bar" role="img" aria-label={counts.map((c, t) => `${RANKS[t]} ${c}`).join(", ")}>
          {counts.map((c, t) => (c ? <span key={t} style={{ flexGrow: c, background: tierColor(t) }} title={`${RANKS[t]}: ${c}`} /> : null))}
        </div>
        <div className="legend">
          {counts.map((c, t) => (
            <button
              key={t}
              type="button"
              className={`${c ? "" : "zero"} ${activeRank === t ? "active" : ""}`}
              onClick={() => onRank(t)}
              aria-pressed={activeRank === t}
            >
              <i style={{ background: tierColor(t) }} />
              {RANKS[t]}
              <b>{c}</b>
            </button>
          ))}
        </div>
      </div>
      <NextList
        title="Closest to Lord"
        target={LORD}
        from={1}
        rows={lord}
        linked={linked}
        empty="Raise a few levels and the heroes nearest Lord show up here."
      />
      <NextList
        title="Closest to Champion"
        target={CHAMPION}
        from={LORD}
        rows={champ}
        linked={linked}
        empty="Once a hero hits Lord, it starts climbing toward Champion here."
      />
    </section>
  );
}

function NextList(props: { title: string; target: number; from: number; rows: HeroRow[]; linked: boolean; empty: string }) {
  const { title, target, from, rows, linked, empty } = props;
  return (
    <div className="panel">
      <h2>
        {title} <b>Lv {target}</b>
      </h2>
      <ul className="next">
        {rows.length ? (
          rows.map((r) => {
            const pct = ((r.effective - from) / (target - from)) * 100;
            return (
              <li key={r.id}>
                <span className="nm">
                  {r.name} <small>Lv {r.effective}</small>
                </span>
                <span className="togo">
                  {linked && r.hoursToNext != null ? `~${formatHours(r.hoursToNext)}` : `${target - r.effective} to go`}
                </span>
                <div className="mini">
                  <span style={{ width: `${pct}%`, background: tierColor(tierOf(r.effective)) }} />
                </div>
              </li>
            );
          })
        ) : (
          <li>
            <p className="empty">{empty}</p>
          </li>
        )}
      </ul>
    </div>
  );
}
