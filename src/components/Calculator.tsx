"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { daysText, defaultGoal, finishDate, goalOptions, hoursText, plan } from "@/lib/calculator";
import { HEROES } from "@/lib/heroes";
import { MAX_LEVEL, clampLevel, pointsBetween } from "@/lib/proficiency";
import { REWARD_KIND_LABEL } from "@/lib/proficiency-rewards";
import { referrerSite, track } from "@/lib/track";
import { LevelStepper } from "./bits";

// Same key the board saves guest levels under.
const LS_LEVELS = "proficiency-board-v1";

const fmt = (n: number) => n.toLocaleString("en-US");
const byName = [...HEROES].sort((a, b) => a.name.localeCompare(b.name));

function readGuestLevels(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_LEVELS) ?? "null");
    if (!parsed || typeof parsed.levels !== "object") return {};
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(parsed.levels)) {
      const level = typeof v === "number" ? v : (v as { level?: unknown })?.level;
      if (typeof level === "number") out[id] = clampLevel(level);
    }
    return out;
  } catch {
    return {};
  }
}

/** The hero on the board with the least play left to its next goal. */
function closestHero(levels: Record<string, number>): string | null {
  let best: { id: string; points: number } | null = null;
  for (const [id, level] of Object.entries(levels)) {
    if (level >= MAX_LEVEL || !HEROES.some((h) => h.id === id)) continue;
    const points = pointsBetween(level, defaultGoal(level));
    if (!best || points < best.points) best = { id, points };
  }
  return best?.id ?? null;
}

type Props = {
  /** Levels from a signed-in player's board; guests' levels are read from this browser. */
  boardLevels: Record<string, number> | null;
};

export function Calculator({ boardLevels }: Props) {
  const [levels, setLevels] = useState<Record<string, number>>(boardLevels ?? {});
  const [heroId, setHeroId] = useState("");
  const [level, setLevel] = useState(1);
  const [goal, setGoal] = useState(defaultGoal(1));
  const [perWeek, setPerWeek] = useState("7");
  const used = useRef(false);

  // Start from the board: the hero closest to a goal, at its saved level.
  useEffect(() => {
    const own = boardLevels ?? readGuestLevels();
    const first = closestHero(own);
    /* eslint-disable react-hooks/set-state-in-effect -- reads this browser's saved board once after mount */
    setLevels(own);
    if (first) {
      setHeroId(first);
      setLevel(own[first]);
      setGoal(defaultGoal(own[first]));
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    track("calc", { action: "view", board: Object.keys(own).length > 0, ref: referrerSite() });
  }, [boardLevels]);

  const markUsed = () => {
    if (used.current) return;
    used.current = true;
    track("calc", { action: "use" });
  };

  const changeLevel = (n: number) => {
    const l = clampLevel(n);
    setLevel(l);
    if (goal <= l) setGoal(defaultGoal(l));
    markUsed();
  };

  const changeHero = (id: string) => {
    setHeroId(id);
    if (id && levels[id] != null) {
      setLevel(levels[id]);
      setGoal(defaultGoal(levels[id]));
    }
    markUsed();
  };

  const hours = Number(perWeek);
  const weekly = Number.isFinite(hours) && hours > 0 ? Math.min(hours, 168) : null;
  const result = useMemo(() => plan(level, goal, weekly), [level, goal, weekly]);
  const goals = goalOptions(level);
  const hero = HEROES.find((h) => h.id === heroId);
  const who = hero?.name ?? "your hero";
  const goalName = result.stops.at(-1)?.rank;
  const maxed = level >= MAX_LEVEL;
  const fromBoard = heroId && levels[heroId] != null && levels[heroId] === level;

  return (
    <>
      <section className="panel calc-form" aria-label="Your hero">
        <div className="calc-field">
          <label htmlFor="calc-hero">Hero</label>
          <select id="calc-hero" value={heroId} onChange={(e) => changeHero(e.target.value)}>
            <option value="">Any hero</option>
            {byName.map((h) => (
              <option key={h.id} value={h.id}>
                {h.name}
                {levels[h.id] != null ? ` (Lv ${levels[h.id]})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="calc-field">
          <label htmlFor="lv-calc">Current level</label>
          <LevelStepper id="calc" name="Current" level={level} onLevel={(_, n) => changeLevel(n)} />
          {fromBoard ? <small>From your board</small> : null}
        </div>
        <div className="calc-field">
          <label htmlFor="calc-goal">Goal</label>
          <select
            id="calc-goal"
            value={maxed ? "" : goal}
            disabled={maxed}
            onChange={(e) => {
              setGoal(Number(e.target.value));
              markUsed();
            }}
          >
            {maxed ? <option value="">Already maxed</option> : null}
            {goals.map((g) => (
              <option key={g.level} value={g.level}>
                {g.label}
              </option>
            ))}
          </select>
        </div>
        <div className="calc-field">
          <label htmlFor="calc-week">Hours you play a week</label>
          <input
            id="calc-week"
            className="calc-num"
            type="number"
            inputMode="decimal"
            min={0}
            max={168}
            value={perWeek}
            onChange={(e) => {
              setPerWeek(e.target.value);
              markUsed();
            }}
            onFocus={(e) => e.target.select()}
          />
          <small>On this hero</small>
        </div>
      </section>

      {maxed ? (
        <section className="panel calc-answer" aria-live="polite">
          <p className="calc-headline">
            {hero ? `${hero.name} is` : "That hero is"} at level {MAX_LEVEL}, the max. Nothing left to earn.
          </p>
        </section>
      ) : (
        <>
          <section className="panel calc-answer" aria-live="polite">
            <p className="calc-headline">
              {goalName} on {who} takes <b>{hoursText(result.hours)}</b> of play
              {result.days != null ? (
                <>
                  , around <b>{finishDate(result.days)}</b> at {weekly} {weekly === 1 ? "hour" : "hours"} a week
                </>
              ) : null}
              .
            </p>
            <div className="stat-row">
              <div className="stat">
                <span>Points needed</span>
                <b>{fmt(result.points)}</b>
                <small>
                  level {result.from} to {result.to}
                </small>
              </div>
              <div className="stat">
                <span>Hours of play</span>
                <b>{Math.round(result.hours * 10) / 10}</b>
                <small>at about 320 points an hour</small>
              </div>
              <div className="stat">
                <span>Finish</span>
                <b>{result.days != null ? finishDate(result.days) : "–"}</b>
                <small>{result.days != null ? `in ${daysText(result.days)}` : "set hours a week"}</small>
              </div>
            </div>
          </section>

          {result.stops.length > 1 ? (
            <section className="panel rank-table-wrap">
              <h2>On the way</h2>
              <div className="table-scroll">
                <table className="rank-table">
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Level</th>
                      <th scope="col">Points</th>
                      <th scope="col">Hours</th>
                      {result.days != null ? <th scope="col">Around</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {result.stops.map((s) => (
                      <tr key={s.level}>
                        <th scope="row">
                          <span className="rk">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/ranks/${s.rank.toLowerCase()}.webp`} alt="" width={52} height={47} />
                            {s.rank}
                          </span>
                        </th>
                        <td>{s.level}</td>
                        <td>{fmt(s.points)}</td>
                        <td>{Math.round(s.hours * 10) / 10}</td>
                        {s.days != null ? <td>{finishDate(s.days)}</td> : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {result.rewards.length ? (
            <section className="panel rank-table-wrap">
              <h2>What you unlock</h2>
              <ul className="calc-rewards">
                {result.rewards.map((r) => (
                  <li key={r.level}>
                    <span className="calc-lv">Lv {r.level}</span>
                    <span>{hero ? r.what.replace("(hero name)", hero.name) : r.what}</span>
                    <small>{REWARD_KIND_LABEL[r.kind]}</small>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {Object.keys(levels).length === 0 ? (
        <section className="banner accent cta">
          <p>
            <strong>Want this for every hero?</strong> Proficiency Board keeps all your levels on one screen and shows the
            hours left to Lord and Champion for each.
          </p>
          <Link href="/" className="btn primary">
            Open the board
          </Link>
        </section>
      ) : null}
    </>
  );
}
