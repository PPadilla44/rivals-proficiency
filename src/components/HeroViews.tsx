"use client";

import { memo } from "react";
import type { HeroRow } from "@/lib/board-model";
import { ROLE_LABEL } from "@/lib/heroes";
import { MAX_LEVEL, RANKS, formatHours, nextMilestone, tierOf } from "@/lib/proficiency";
import { LevelStepper, Portrait, RankBadge, portraitTier, tierColor } from "./bits";

export type LevelHandler = (heroId: string, level: number, fromEstimate?: boolean) => void;

export function progressOf(row: HeroRow) {
  const { effective, estimate } = row;
  const m = nextMilestone(effective);
  const pct =
    effective >= MAX_LEVEL
      ? 100
      : Math.min(100, ((effective - m.from + (estimate?.fraction ?? 0)) / (m.to - m.from)) * 100);
  const togo = m.to - effective;
  const hot = (m.label === "Lord" && togo <= 5) || (m.label === "Champion" && togo <= 10);
  return { m, pct, togo, hot };
}

function Progress({ row }: { row: HeroRow }) {
  const { m, pct, togo, hot } = progressOf(row);
  const t = tierOf(row.effective);
  return (
    <div className="prog">
      <div className="track">
        <div className="fill" style={{ width: `${pct}%`, background: tierColor(t) }} />
      </div>
      <div className="meta">
        {row.effective >= MAX_LEVEL ? (
          <>
            <b>Maxed</b>
            <span>70 / 70</span>
          </>
        ) : (
          <>
            <span className={hot ? "hot" : ""}>
              <b>{togo}</b> to {m.label}
              {row.hoursToNext != null ? ` · ~${formatHours(row.hoursToNext)}` : ""}
            </span>
            <span>Lv {m.to}</span>
          </>
        )}
      </div>
    </div>
  );
}

function Estimate({ row, onLevel }: { row: HeroRow; onLevel: LevelHandler }) {
  const { estimate, level, id, name } = row;
  if (!estimate || estimate.gained <= 0) return null;
  return (
    <span className="est" title={`${formatHours(estimate.hoursSince)} played since you set Lv ${level}`}>
      est. Lv {estimate.level}!
      <button type="button" onClick={() => onLevel(id, estimate.level, true)} aria-label={`Set ${name} to level ${estimate.level}`}>
        Use
      </button>
    </span>
  );
}

type Props = { row: HeroRow; portrait?: string; onLevel: LevelHandler };

/** Card: portrait up top (gold for Lord and up, animated for Champion), rank, big level, progress. */
export const HeroCard = memo(function HeroCard({ row, portrait, onLevel }: Props) {
  const t = tierOf(row.effective);
  return (
    <article className={`card role-${row.role}${t >= 10 ? " champ" : t >= 4 ? " lord" : ""}`} aria-label={row.name}>
      <div className="card-art">
        <Portrait heroId={row.id} name={row.name} role={row.role} tier={portraitTier(t)} fallbackSrc={portrait} />
        <span className={`role-tag role-${row.role}`}>{ROLE_LABEL[row.role]}</span>
        <span className="rank-sticker">
          <RankBadge tier={t} size={24} />
          {RANKS[t]}
        </span>
      </div>
      <div className="card-body">
        <h3 className="card-name">{row.name}</h3>
        <Estimate row={row} onLevel={onLevel} />
        <LevelStepper id={row.id} name={row.name} level={row.level} onLevel={onLevel} big />
        <Progress row={row} />
      </div>
    </article>
  );
});

/** Compact row for fast editing. */
export const HeroLine = memo(function HeroLine({ row, portrait, onLevel }: Props) {
  const t = tierOf(row.effective);
  return (
    <div className="hero">
      <div className="name">
        <Portrait heroId={row.id} name={row.name} role={row.role} tier={portraitTier(t)} fallbackSrc={portrait} variant="thumb" />
        <span className="name-text">
          <span>{row.name}</span>
          <span className={`role role-${row.role}`}>{ROLE_LABEL[row.role]}</span>
          <Estimate row={row} onLevel={onLevel} />
        </span>
      </div>
      <div className={`rank${t >= 10 ? " champ" : t >= 4 ? " lord" : ""}`}>
        <RankBadge tier={t} size={28} />
        <span>{RANKS[t]}</span>
      </div>
      <LevelStepper id={row.id} name={row.name} level={row.level} onLevel={onLevel} />
      <Progress row={row} />
    </div>
  );
});
