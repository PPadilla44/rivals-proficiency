"use client";

import { useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/heroes";
import { MAX_LEVEL, RANKS } from "@/lib/proficiency";

export const tierColor = (t: number) => `var(--t${t})`;

/** The in-game proficiency badge for a rank, on a dark tile like the Heroes tab. */
export function RankBadge({ tier, size = 26 }: { tier: number; size?: number }) {
  const rank = RANKS[Math.max(0, Math.min(RANKS.length - 1, tier))];
  return (
    <span className="rank-badge" style={{ width: size, height: size }} title={rank}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/ranks/${rank.toLowerCase()}.webp`} alt="" width={size} height={size} loading="lazy" decoding="async" />
    </span>
  );
}

function initials(name: string): string {
  const words = name.replace(/^The /, "").split(/[\s&-]+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase();
}

export type PortraitTier = "base" | "lord" | "champ";

/** Lord styling from level 20 (Lord to Guardian), animated Champion from level 50. */
export function portraitTier(tier: number): PortraitTier {
  return tier >= 10 ? "champ" : tier >= 4 ? "lord" : "base";
}

/** Runs Champion animations only while the card is on screen. */
function useOnScreen<T extends Element>(enabled: boolean) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "80px" });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);
  return [ref, visible] as const;
}

/**
 * Official hero headshot (stored with the site), falling back to the stats
 * API's art for heroes added later, then to a halftone monogram.
 */
export function Portrait({
  heroId,
  name,
  role,
  tier,
  fallbackSrc,
  variant = "card",
}: {
  heroId: string;
  name: string;
  role: Role;
  tier: PortraitTier;
  fallbackSrc?: string;
  variant?: "card" | "thumb";
}) {
  const sources = [`/heroes/${heroId}.webp`, fallbackSrc].filter(Boolean) as string[];
  const [attempt, setAttempt] = useState(0);
  const src = sources[attempt];
  const [ref, onScreen] = useOnScreen<HTMLDivElement>(tier === "champ");

  const art = src ? (
    // Small static files; next/image would add nothing at this size.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" decoding="async" onError={() => setAttempt((a) => a + 1)} />
  ) : (
    <span className="monogram" aria-hidden="true">
      {initials(name)}
    </span>
  );

  if (variant === "thumb") {
    return <div className={`portrait thumb tier-${tier} role-${role}`}>{art}</div>;
  }

  return (
    <div ref={ref} className={`portrait tier-${tier} role-${role}${onScreen ? " live" : ""}`}>
      {tier === "champ" ? (
        <span className="sparks" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
        </span>
      ) : null}
      <div className={`inset${src ? "" : " empty"}`}>
        {art}
        {tier !== "base" ? <span className="foil" aria-hidden="true" /> : null}
      </div>
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

export function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
