"use client";

import type { ReactNode } from "react";
import { CHAMPION, LORD, formatHours, tierOf } from "@/lib/proficiency";
import type { HeroRow } from "@/lib/board-model";
import { Portrait, RankBadge, portraitTier, tierColor } from "./bits";

type Props = {
  rows: HeroRow[];
  /** Hours come from linked playtime, so they replace the "levels to go" count. */
  linked: boolean;
  /** "sample": the example board. "start": a guest with nothing set. "own": the player's own board. */
  kind: "sample" | "start" | "own";
  /** Whether the player has set any level yet. */
  anyLevel: boolean;
  /** The player just left the sample board, whose card is taller on a phone: keep that height for the visit. */
  fromSample?: boolean;
  /** Gold button: leave the sample, or start typing levels. */
  onEnter?: () => void;
  /** Guest who just left the sample: the space the sample's button took holds a sign-in button instead of staying empty. */
  onSignIn?: () => void;
  /** Extra buttons on the right, such as Share. */
  actions?: ReactNode;
  /** Fallback art by hero id, for heroes whose headshot is not stored with the site yet. */
  portraits?: Record<string, string>;
};

/**
 * The first thing on the page: which hero is closest to Lord (or to Champion, once every
 * started hero has reached Lord). It always takes the same height, so nothing below it moves
 * when the answer appears or changes.
 */
export default function AnswerCard({ rows, linked, kind, anyLevel, fromSample, onEnter, onSignIn, actions, portraits }: Props) {
  const started = rows.filter((r) => r.effective > 1);
  const toLord = started
    .filter((r) => r.effective < LORD)
    .sort((a, b) => b.effective - a.effective || (a.hoursToNext ?? 0) - (b.hoursToNext ?? 0));
  const toChamp = started
    .filter((r) => r.effective >= LORD && r.effective < CHAMPION)
    .sort((a, b) => b.effective - a.effective || (a.hoursToNext ?? 0) - (b.hoursToNext ?? 0));
  const target = toLord.length ? LORD : CHAMPION;
  const hero = toLord[0] ?? toChamp[0] ?? null;
  const lordPlus = rows.filter((r) => r.effective >= LORD).length;
  const goal = target === LORD ? "Lord" : "Champion";
  // A screenshot import only knows the rank, so the level shown is the lowest it could be.
  const rankOnly = !!hero && hero.approx && !hero.estimate;
  const left = hero ? target - hero.effective : 0;

  return (
    <section className={`answer${kind === "start" ? " start" : ""}${kind === "sample" || fromSample ? " sample-height" : ""}`} aria-label="Closest to Lord">
      <div className="answer-main">
        <p className="answer-label">
          {kind === "sample" ? <span className="answer-tag">Sample</span> : null}
          {hero ? `Closest to ${target === LORD ? "Lord" : "Champion"}` : "Closest to Lord"}
        </p>
        {hero ? (
          <div className="answer-hero">
            <Portrait
              heroId={hero.id}
              name={hero.name}
              role={hero.role}
              tier={portraitTier(tierOf(hero.effective))}
              fallbackSrc={portraits?.[hero.id]}
              variant="thumb"
            />
            <div className="answer-text">
              <p className="answer-name">
                {hero.name} <span>Lv {hero.effective}{rankOnly ? "+" : ""}</span>
              </p>
              <p className="answer-sub">
                <RankBadge tier={tierOf(hero.effective)} size={20} />
                {linked && hero.hoursToNext != null
                  ? `${rankOnly ? "Up to about" : "About"} ${formatHours(hero.hoursToNext)} to ${goal}`
                  : rankOnly
                    ? `Up to ${left} ${left === 1 ? "level" : "levels"} to go`
                    : `${left} ${left === 1 ? "level" : "levels"} to go${hero.hoursToNext != null ? `, about ${formatHours(hero.hoursToNext)}` : ""}`}
              </p>
              <div className="answer-bar" aria-hidden="true">
                <span style={{ width: `${((hero.effective - (target === LORD ? 1 : LORD)) / (target - (target === LORD ? 1 : LORD))) * 100}%`, background: tierColor(tierOf(hero.effective)) }} />
              </div>
            </div>
          </div>
        ) : (
          <div className="answer-text">
            <p className="answer-name muted">{anyLevel ? `${lordPlus} at Lord or higher` : "Not set yet"}</p>
            <p className="answer-sub">Set a few levels and the hero nearest Lord shows up here.</p>
          </div>
        )}
      </div>
      <div className="answer-side">
        {kind === "sample" ? <p className="answer-note">This is a sample board, not yours.</p> : null}
        {fromSample && kind !== "sample" ? (
          onSignIn ? (
            <>
              <p className="answer-note">Saved in this browser only.</p>
              <button type="button" className="btn" onClick={onSignIn}>
                Sign in to keep it
              </button>
            </>
          ) : (
            <p className="answer-note">Saved to your account.</p>
          )
        ) : null}
        {onEnter ? (
          <button type="button" className={kind === "sample" ? "btn primary" : "btn"} onClick={onEnter}>
            Enter my levels
          </button>
        ) : null}
        {actions}
      </div>
    </section>
  );
}
