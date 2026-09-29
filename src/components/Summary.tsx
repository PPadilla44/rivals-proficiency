"use client";

import { useState } from "react";
import { CHAMPION, LORD, RANKS, formatHours, tierOf } from "@/lib/proficiency";
import type { HeroRow } from "@/lib/board-model";

import { RankBadge, tierColor } from "./bits";

type Props = {
  rows: HeroRow[];
  activeRank: number | null;
  onRank: (tier: number) => void;
  linked: boolean;
};

/** Four headline numbers above the board (hidden on phones, which get the one-line strip). */
export function StatTiles({ rows }: { rows: HeroRow[] }) {
  const lordPlus = rows.filter((r) => r.effective >= LORD).length;
  const champs = rows.filter((r) => r.effective >= CHAMPION).sort((a, b) => b.effective - a.effective);
  const nextChamp = rows
    .filter((r) => r.effective >= LORD && r.effective < CHAMPION)
    .sort((a, b) => b.effective - a.effective)[0];
  const nextLord = rows
    .filter((r) => r.effective > 1 && r.effective < LORD)
    .sort((a, b) => b.effective - a.effective)[0];
  const tiles = [
    { label: "Lord or higher", value: String(lordPlus), unit: `/ ${rows.length}`, sub: lordPlus ? "heroes past level 20" : "none yet" },
    {
      label: "Champion",
      value: String(champs.length),
      unit: "",
      sub: champs[0] ? `${champs[0].name} · Lv ${champs[0].effective}` : "reach level 50 on a hero",
    },
    {
      label: "Next Champion",
      value: nextChamp ? String(CHAMPION - nextChamp.effective) : "-",
      unit: nextChamp ? "levels" : "",
      sub: nextChamp ? `${nextChamp.name} · Lv ${nextChamp.effective}` : "get a hero to Lord first",
    },
    {
      label: "Next Lord",
      value: nextLord ? String(LORD - nextLord.effective) : "-",
      unit: nextLord ? "levels" : "",
      sub: nextLord ? `${nextLord.name} · Lv ${nextLord.effective}` : "set a few levels to see it",
    },
  ];
  return (
    <section className="tiles" aria-label="Highlights">
      {tiles.map((t) => (
        <div key={t.label} className="tile">
          <span className="tile-label">{t.label}</span>
          <span className="tile-value">
            <b>{t.value}</b> {t.unit}
          </span>
          <span className="tile-sub">{t.sub}</span>
        </div>
      ))}
    </section>
  );
}

export function Summary({ rows, activeRank, onRank, linked }: Props) {
  const [open, setOpen] = useState(false);
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

  const lordPlus = rows.filter((r) => r.effective >= LORD).length;
  const champions = rows.filter((r) => r.effective >= CHAMPION).length;
  const nearest = lord[0];

  return (
    <section className={`summary${open ? " open" : ""}`} aria-label="Overview">
      {/* Phones get a one-line overview; the panels open on demand. */}
      <div className="summary-strip">
        <span>
          <b>{lordPlus}</b> Lord or higher · <b>{champions}</b> Champion
          {nearest ? (
            <>
              {" "}
              · next Lord: <b>{nearest.name}</b> ({LORD - nearest.effective} to go)
            </>
          ) : null}
        </span>
        <button type="button" className="btn small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Overview"}
        </button>
      </div>
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
              <RankBadge tier={t} size={18} />
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
