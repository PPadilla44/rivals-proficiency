"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { daysText, defaultGoal, finishDate, goalOptions, hoursText, plan } from "@/lib/calculator";
import { CALC_NOTICE_KEY, GUEST_LEVELS_KEY, addHeroIfMissing, type CalcNotice } from "@/lib/guest-board";
import { HEROES } from "@/lib/heroes";
import { DEFAULT_POINTS_PER_HOUR, MAX_LEVEL, clampLevel, pointsBetween, tierOf } from "@/lib/proficiency";
import { REWARD_KIND_LABEL } from "@/lib/proficiency-rewards";
import { referrerSite, track } from "@/lib/track";
import { LevelStepper, Portrait, portraitTier } from "./bits";

// Same key the board saves guest levels under.
const LS_LEVELS = GUEST_LEVELS_KEY;

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

/**
 * Shown to visitors with no board yet, right under the answer. For a guest with a hero picked above level 1 it can carry
 * that hero over: the levels are saved to this browser here (adding only, never overwriting) and the board opens with
 * it already on it. Everyone else gets a plain link to the board.
 */
function BoardBox({ guest, heroId, heroName, level }: { guest: boolean; heroId: string; heroName: string | null; level: number }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        track("calc", { action: "box_seen" });
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const canAdd = guest && !!heroName && level >= 2;

  // The board shows what happened and records the tap (a request sent here could be cut off by the page change).
  const go = (via: "add" | "open") => {
    let notice: CalcNotice = { via: "open", at: Date.now() };
    if (via === "add" && canAdd) {
      let result: CalcNotice["result"] = "failed";
      let existing: number | undefined;
      try {
        const out = addHeroIfMissing(localStorage.getItem(GUEST_LEVELS_KEY), heroId, level);
        result = out.result;
        existing = out.existing;
        if (out.next) localStorage.setItem(GUEST_LEVELS_KEY, out.next);
      } catch {
        result = "failed";
      }
      notice = { via: "add", hero: heroId, level, result, existing, at: Date.now() };
    }
    try {
      sessionStorage.setItem(CALC_NOTICE_KEY, JSON.stringify(notice));
    } catch {}
    // A full page load on purpose: the board decides what to draw before first paint from what is saved in this browser,
    // and a client-side navigation would skip that and flash the sample board.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/");
  };

  return (
    <section className="banner accent cta calc-box" ref={ref} aria-label="Track every hero on one board">
      <p>
        <strong>{canAdd ? `Track ${heroName} and every other hero on one board` : "See every hero's hours to Lord on one board"}</strong>
        <br />
        Free, no sign-up. Your levels stay in this browser.
      </p>
      <div className="actions">
        {canAdd ? (
          <>
            <button type="button" className="btn primary" onClick={() => go("add")}>
              Add {heroName} (Lv {level}) to my board
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full page load, see go() */}
            <a className="btn" href="/" onClick={(e) => { e.preventDefault(); go("open"); }}>
              Open the board
            </a>
          </>
        ) : (
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- full page load, see go()
          <a className="btn primary" href="/" onClick={(e) => { e.preventDefault(); go("open"); }}>
            Open the board
          </a>
        )}
      </div>
    </section>
  );
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
  const picked = useRef(false);
  // Dates depend on the visitor's own clock and time zone, so they only render in the browser.
  const [now, setNow] = useState<Date | null>(null);

  // Start from the board: the hero closest to a goal, at its saved level.
  useEffect(() => {
    const own = boardLevels ?? readGuestLevels();
    const first = closestHero(own);
    /* eslint-disable react-hooks/set-state-in-effect -- reads this browser's saved board once after mount */
    setNow(new Date());
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
    // Once per visit, and only for a hero the visitor chose (the one filled in from their board does not count).
    if (id && !picked.current) {
      picked.current = true;
      track("calc", { action: "hero", board: Object.keys(levels).length > 0 });
    }
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
  const goalName = result.stops.at(-1)?.label;
  const date = (days: number | null) => (days != null && now ? finishDate(days, now) : null);
  const finish = date(result.days);
  const maxed = level >= MAX_LEVEL;
  const fromBoard = heroId && levels[heroId] != null && levels[heroId] === level;
  // Only once the browser has read its own board, so a guest who has one never sees the box flash in.
  const showBox = now !== null && Object.keys(levels).length === 0;
  const box = showBox ? <BoardBox guest={boardLevels === null} heroId={heroId} heroName={hero?.name ?? null} level={level} /> : null;

  return (
    <>
      <section className="panel calc-form" aria-label="Your hero">
        <div className="calc-field full">
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
        <div className="calc-field full">
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
        <>
          <section className="panel calc-answer" aria-live="polite">
            <div className="calc-who">
              {hero ? <Portrait key={hero.id} heroId={hero.id} name={hero.name} role={hero.role} tier={portraitTier(tierOf(level))} variant="thumb" /> : null}
              <p className="calc-headline">
                {hero ? `${hero.name} is at level ${MAX_LEVEL}, the max.` : `Level ${MAX_LEVEL} is the max.`} Nothing left to earn.
              </p>
            </div>
          </section>
          {box}
        </>
      ) : (
        <>
          <section className="panel calc-answer" aria-live="polite">
            <div className="calc-who">
              {hero ? <Portrait key={hero.id} heroId={hero.id} name={hero.name} role={hero.role} tier={portraitTier(tierOf(level))} variant="thumb" /> : null}
              <p className="calc-headline">
                {goalName} on {who} takes <b>{hoursText(result.hours)}</b> of play
                {finish ? (
                  <>
                    , around <b>{finish}</b> at {weekly} {weekly === 1 ? "hour" : "hours"} a week
                  </>
                ) : null}
                .
              </p>
            </div>
            <div className="stat-row">
              <div className="stat">
                <span>Points needed</span>
                <b>{fmt(result.points)}</b>
                <small className="stat-extra">
                  level {result.from} to {result.to}
                </small>
              </div>
              <div className="stat">
                <span>Hours of play</span>
                <b>{Math.round(result.hours * 10) / 10}</b>
                <small>at about {DEFAULT_POINTS_PER_HOUR} points an hour</small>
              </div>
              <div className="stat">
                <span>Finish</span>
                <b>{finish ?? "–"}</b>
                <small className={result.days != null ? "stat-extra" : undefined}>{result.days != null ? `in ${daysText(result.days)}` : "set hours a week"}</small>
              </div>
            </div>
          </section>

          {box}

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
                      {finish ? <th scope="col">Around</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {result.stops.map((s) => (
                      <tr key={s.level}>
                        <th scope="row">
                          <span className="rk">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={`/ranks/${s.rank.toLowerCase()}.webp`} alt="" width={52} height={47} />
                            {s.label}
                          </span>
                        </th>
                        <td>{s.level}</td>
                        <td>{fmt(s.points)}</td>
                        <td>{Math.round(s.hours * 10) / 10}</td>
                        {finish ? <td>{date(s.days)}</td> : null}
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
    </>
  );
}
