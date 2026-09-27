"use client";

import { useState } from "react";
import type { Role } from "@/lib/heroes";
import { MAX_LEVEL } from "@/lib/proficiency";

export const tierColor = (t: number) => `var(--t${t})`;

export function Shield({ tier, size = 26 }: { tier: number; size?: number }) {
  return (
    <svg className="shield" width={size} height={size * 1.1} viewBox="0 0 22 24" aria-hidden="true">
      <path
        d="M11 1.5 20 5v6.5c0 5.4-3.8 9.3-9 11-5.2-1.7-9-5.6-9-11V5z"
        fill={tierColor(tier)}
        stroke="var(--ink)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <text x="11" y="15.6" textAnchor="middle" fontFamily="var(--display)" fontSize="10" fill="#fff">
        {tier === 10 ? "C" : tier}
      </text>
    </svg>
  );
}

function initials(name: string): string {
  const words = name.replace(/^The /, "").split(/[\s&-]+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

/** Hero art from the stats API, or a halftone monogram when there is none. */
export function Portrait({
  name,
  role,
  src,
  className,
}: {
  name: string;
  role: Role;
  src?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const show = src && !failed;
  return (
    <div className={`portrait role-${role} ${className ?? ""}`}>
      {show ? (
        // Linked from the stats API's image server; not optimized through Vercel.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <span className="monogram" aria-hidden="true">
          {initials(name)}
        </span>
      )}
    </div>
  );
}

/** Minus, typed number, plus. Commits on blur or Enter. */
export function LevelStepper({
  id,
  name,
  level,
  onLevel,
  big = false,
}: {
  id: string;
  name: string;
  level: number;
  onLevel: (heroId: string, level: number) => void;
  big?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (Number.isFinite(n) && n !== level) onLevel(id, n);
  };
  return (
    <div className={`lvl${big ? " big" : ""}`}>
      <button type="button" aria-label={`Lower ${name} level`} disabled={level <= 1} onClick={() => onLevel(id, level - 1)}>
        &minus;
      </button>
      <input
        id={`lv-${id}${big ? "-card" : ""}`}
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_LEVEL}
        value={draft ?? String(level)}
        aria-label={`${name} level`}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
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
  );
}
