"use client";

import { memo, useState } from "react";
import type { HeroRow } from "@/lib/board-model";
import { ROLE_LABEL } from "@/lib/heroes";
import { MAX_LEVEL, RANKS, formatHours, nextMilestone, tierOf } from "@/lib/proficiency";
import { tierColor } from "./Summary";

type Props = {
  row: HeroRow;
  onLevel: (heroId: string, level: number, fromEstimate?: boolean) => void;
};

function Shield({ tier }: { tier: number }) {
  return (
    <svg className="shield" viewBox="0 0 22 24" aria-hidden="true">
      <path d="M11 1.5 20 5v6.5c0 5.4-3.8 9.3-9 11-5.2-1.7-9-5.6-9-11V5z" fill={tierColor(tier)} />
      <text x="11" y="15.5" textAnchor="middle" fontFamily="var(--mono)" fontSize="9" fontWeight="600" fill="#fff">
        {tier === 10 ? "C" : tier}
      </text>
    </svg>
  );
}

export const HeroLine = memo(function HeroLine({ row, onLevel }: Props) {
  const { id, name, role, level, estimate, effective, hoursToNext } = row;
  const [draft, setDraft] = useState<string | null>(null);
  const t = tierOf(effective);
  const m = nextMilestone(effective);
  const pct =
    effective >= MAX_LEVEL
      ? 100
      : Math.min(100, ((effective - m.from + (estimate?.fraction ?? 0)) / (m.to - m.from)) * 100);
  const togo = m.to - effective;
  const hot = (m.label === "Lord" && togo <= 5) || (m.label === "Champion" && togo <= 10);

  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (Number.isFinite(n) && n !== level) onLevel(id, n);
  };

  return (
    <div className="hero">
      <div className="name">
        <span>{name}</span>
        {estimate && estimate.gained > 0 ? (
          <span className="est" title={`${formatHours(estimate.hoursSince)} played since you set Lv ${level}`}>
            est. Lv {estimate.level}
            <button type="button" onClick={() => onLevel(id, estimate.level, true)} aria-label={`Set ${name} to level ${estimate.level}`}>
              Use
            </button>
          </span>
        ) : null}
      </div>
      <span className={`role ${role}`}>{ROLE_LABEL[role]}</span>
      <div className="rank">
        <Shield tier={t} />
        <span>{RANKS[t]}</span>
      </div>
      <div className="lvl">
        <button type="button" aria-label={`Lower ${name} level`} disabled={level <= 1} onClick={() => onLevel(id, level - 1)}>
          &minus;
        </button>
        <input
          id={`lv-${id}`}
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_LEVEL}
          value={draft ?? String(level)}
          aria-label={`${name} level`}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setDraft(null);
          }}
        />
        <button type="button" aria-label={`Raise ${name} level`} disabled={level >= MAX_LEVEL} onClick={() => onLevel(id, level + 1)}>
          +
        </button>
      </div>
      <div className="prog">
        <div className="track">
          <div className="fill" style={{ width: `${pct}%`, background: tierColor(t) }} />
        </div>
        <div className="meta">
          {effective >= MAX_LEVEL ? (
            <>
              <b>Maxed</b>
              <span>70 / 70</span>
            </>
          ) : (
            <>
              <span className={hot ? "hot" : ""}>
                <b>{togo}</b> to {m.label}
                {hoursToNext != null ? ` · ~${formatHours(hoursToNext)}` : ""}
              </span>
              <span>Lv {m.to}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
