"use client";

import { useEffect, useRef, useState } from "react";
import type { Role } from "@/lib/heroes";
import { MAX_LEVEL, RANKS } from "@/lib/proficiency";

// Hold-to-repeat timing for the level buttons, in milliseconds.
const HOLD_DELAY = 400;
const HOLD_FIRST_GAP = 130;
const HOLD_MIN_GAP = 35;

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
/**
 * A plus or minus button. A tap or click moves one level. Press and hold to
 * keep counting, slowly at first and then faster. The single step happens on
 * click, not on press, so a finger that lands here while scrolling changes nothing.
 */
function StepButton({
  dir,
  level,
  label,
  onStep,
  children,
}: {
  dir: 1 | -1;
  level: number;
  label: string;
  onStep: (level: number, held: boolean) => void;
  children: React.ReactNode;
}) {
  const cur = useRef(level);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeated = useRef(false);
  const step = useRef(onStep);
  useEffect(() => {
    step.current = onStep;
    if (!timer.current) cur.current = level;
  }, [level, onStep]);
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  // The click that ends a hold arrives right after the release; forget the hold once it has passed.
  const release = () => {
    stop();
    setTimeout(() => (repeated.current = false), 0);
  };
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const start = () => {
    stop();
    repeated.current = false;
    cur.current = level;
    let gap = HOLD_FIRST_GAP;
    const tick = () => {
      const next = cur.current + dir;
      if (next < 1 || next > MAX_LEVEL) return stop();
      repeated.current = true;
      cur.current = next;
      step.current(next, true);
      gap = Math.max(HOLD_MIN_GAP, gap * 0.88);
      timer.current = setTimeout(tick, gap);
    };
    timer.current = setTimeout(tick, HOLD_DELAY);
  };
  const atEnd = dir === 1 ? level >= MAX_LEVEL : level <= 1;
  return (
    <button
      type="button"
      aria-label={label}
      disabled={atEnd}
      onPointerDown={(e) => {
        if (e.button === 0) start();
      }}
      onPointerUp={() => release()}
      onPointerLeave={() => release()}
      onPointerCancel={() => release()}
      onBlur={() => release()}
      onContextMenu={(e) => {
        if (timer.current || repeated.current) e.preventDefault();
      }}
      onClick={() => {
        stop();
        // After a hold, the release also fires a click: that one is not a step.
        if (repeated.current) {
          repeated.current = false;
          return;
        }
        onStep(level + dir, false);
      }}
    >
      {children}
    </button>
  );
}

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
  onLevel: (heroId: string, level: number, fromEstimate?: boolean, held?: boolean) => void;
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
      <StepButton dir={-1} level={level} label={`Lower ${name} level`} onStep={(n, held) => onLevel(id, n, false, held)}>
        &minus;
      </StepButton>
      <input
        id={`lv-${id}${big ? "-card" : ""}`}
        type="number"
        inputMode="numeric"
        min={1}
        max={MAX_LEVEL}
        value={draft ?? String(level)}
        aria-label={`${name} level`}
        title="Type a level"
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setDraft(null);
        }}
      />
      <StepButton dir={1} level={level} label={`Raise ${name} level`} onStep={(n, held) => onLevel(id, n, false, held)}>
        +
      </StepButton>
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
