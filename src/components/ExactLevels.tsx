"use client";

import { useEffect, useRef, useState } from "react";
import { LORD, tierOf } from "@/lib/proficiency";
import { closestContenders, exactChoices, type HeroRow } from "@/lib/board-model";
import { track } from "@/lib/track";
import { Portrait, portraitTier } from "./bits";

type Props = {
  rows: HeroRow[];
  portraits?: Record<string, string>;
  /** Sets a hero's level on the board (saved as an exact level, even when it equals the rank's first level). */
  onLevel: (heroId: string, level: number) => void;
  /** Hide the panel until the next import. */
  onSkip: () => void;
};

type Done = { level: number; floor: number; target: number };

/**
 * After a screenshot import every hero sits at the first level of its rank, so "closest to Lord" can be
 * wrong. This lists only the rank-only heroes whose real level could change the answer, with one tap per
 * hero to say the exact level. Rows stay in place once answered, so nothing moves under a finger.
 */
export default function ExactLevels({ rows, portraits, onLevel, onSkip }: Props) {
  const found = closestContenders(rows);
  const [done, setDone] = useState<Record<string, Done>>({});
  const [said, setSaid] = useState("");
  const [closed, setClosed] = useState(false);
  const prompted = useRef(false);

  const live = found?.rows ?? [];
  useEffect(() => {
    if (!found || prompted.current) return;
    prompted.current = true;
    track("exact_prompt", { heroes: found.rows.length + found.more, target: found.target === LORD ? "lord" : "champ" });
  }, [found]);

  // The heroes still open, plus the ones just answered, in the order they first appeared.
  const liveIds = new Set(live.map((r) => r.id));
  const shown = rows
    .filter((r) => liveIds.has(r.id) || done[r.id])
    .sort((a, b) => (done[b.id]?.floor ?? b.effective) - (done[a.id]?.floor ?? a.effective) || a.order - b.order);
  if (closed || !shown.length) return null;

  const target = found?.target ?? Object.values(done)[0]?.target ?? LORD;
  const goal = target === LORD ? "Lord" : "Champion";
  const open = shown.filter((r) => !done[r.id]).length;
  const allDone = open === 0;

  const pick = (row: HeroRow, level: number) => {
    const floor = done[row.id]?.floor ?? row.level;
    track("exact_set", { target: target === LORD ? "lord" : "champ", off: level - floor, confirm: level === floor });
    onLevel(row.id, level);
    setDone((d) => ({ ...d, [row.id]: { level, floor, target } }));
    setSaid(`Saved: ${row.name} level ${level}`);
  };

  return (
    <section className="panel exact" aria-label="Set exact levels">
      <div className="exact-head">
        <div>
          <h2>{allDone ? "Thanks, those are exact now" : `Which is closest to ${goal}?`}</h2>
          <p className="muted">
            {allDone
              ? `The card above shows the real closest hero.`
              : `A screenshot only shows rank, so these heroes could be higher than shown. Pick the exact level of each to find the real closest one.`}
          </p>
          {allDone ? null : (
            <p className="muted exact-hint">
              In game: open Heroes, pick the hero, then the Proficiency tab. The level is at the bottom left, next to the rank name.
            </p>
          )}
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            if (allDone) {
              setClosed(true);
              return;
            }
            track("exact_skip", { left: open });
            onSkip();
          }}
        >
          {allDone ? "Done" : "Skip for now"}
        </button>
      </div>
      <ul className="exact-rows">
        {shown.map((r) => {
          const d = done[r.id];
          const choices = exactChoices(r, target);
          const lo = choices[0];
          const hi = choices[choices.length - 1];
          return (
            <li key={r.id} className={d ? "done" : undefined}>
              <div className="exact-hero">
                <Portrait
                  heroId={r.id}
                  name={r.name}
                  role={r.role}
                  tier={portraitTier(tierOf(r.effective))}
                  fallbackSrc={portraits?.[r.id]}
                  variant="thumb"
                />
                <div>
                  <p className="exact-name">{r.name}</p>
                  <p className="exact-sub">{d ? `Level ${d.level}` : `Level ${lo} to ${hi}`}</p>
                </div>
              </div>
              <div className="exact-chips" role="group" aria-label={`${r.name} exact level`}>
                {choices.map((l) => (
                  <button key={l} type="button" className="lvl-chip" aria-pressed={d?.level === l} onClick={() => pick(r, l)}>
                    {l}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {found && found.more > 0 ? <p className="muted exact-more">and {found.more} more once these are set</p> : null}
      <p className="exact-live" role="status">
        {said}
      </p>
    </section>
  );
}
