"use client";

import type { ReactNode } from "react";
import { CHAMPION, LORD, formatHours, tierOf } from "@/lib/proficiency";
import type { HeroRow } from "@/lib/board-model";
import { RankBadge, tierColor } from "./bits";

type Props = {
  rows: HeroRow[];
  /** Hours come from linked playtime, so they replace the "levels to go" count. */
  linked: boolean;
  /** "sample": the example board. "start": a guest with nothing set. "own": the player's own board. */
  kind: "sample" | "start" | "own";
  /** Whether the player has set any level yet. */
  anyLevel: boolean;
  /** Gold button: leave the sample, or start typing levels. */
  onEnter?: () => void;
  /** Extra buttons on the right, such as Share. */
  actions?: ReactNode;
};

/**
 * The first thing on the page: which hero is closest to Lord (or to Champion, once every
 * started hero has reached Lord). It always takes the same height, so nothing below it moves
 * when the answer appears or changes.
 */
export default function AnswerCard({ rows, linked, kind, anyLevel, onEnter, actions }: Props) {
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

  return (
    <section className="answer" aria-label="Closest to Lord">
      <div className="answer-main">
        <p className="answer-label">
          {kind === "sample" ? <span className="answer-tag">Sample</span> : null}
          {hero ? `Closest to ${target === LORD ? "Lord" : "Champion"}` : "Closest to Lord"}
        </p>
        {hero ? (
          <div className="answer-hero">
            <RankBadge tier={tierOf(hero.effective)} size={44} />
            <div className="answer-text">
              <p className="answer-name">
                {hero.name} <span>Lv {hero.effective}</span>
              </p>
              <p className="answer-sub">
                {linked && hero.hoursToNext != null
                  ? `About ${formatHours(hero.hoursToNext)} to Lord`
                  : `${target - hero.effective} ${target - hero.effective === 1 ? "level" : "levels"} to go${hero.hoursToNext != null ? `, about ${formatHours(hero.hoursToNext)}` : ""}`}
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
