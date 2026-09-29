export const MIN_LEVEL = 1;
export const MAX_LEVEL = 70;
export const LORD = 20;
export const CHAMPION = 50;

export const RANKS = [
  "Agent",
  "Knight",
  "Captain",
  "Centurion",
  "Lord",
  "Count",
  "Colonel",
  "Warrior",
  "Elite",
  "Guardian",
  "Champion",
] as const;
export type RankName = (typeof RANKS)[number];

/** A new rank every 5 levels; Champion covers 50 to 70. */
export function tierOf(level: number): number {
  return Math.min(10, Math.floor(clampLevel(level) / 5));
}

export function rankOf(level: number): RankName {
  return RANKS[tierOf(level)];
}

/** First and last level of a rank: Agent 1 to 4, Knight 5 to 9, ... Champion 50 to 70. */
export function rankLevels(tier: number): [number, number] {
  const last = RANKS.length - 1;
  return [Math.max(MIN_LEVEL, tier * 5), tier >= last ? MAX_LEVEL : tier * 5 + 4];
}

export function clampLevel(level: number): number {
  if (!Number.isFinite(level)) return MIN_LEVEL;
  return Math.max(MIN_LEVEL, Math.min(MAX_LEVEL, Math.round(level)));
}

export type Milestone = { label: "Lord" | "Champion" | "Max"; from: number; to: number };

export function nextMilestone(level: number): Milestone {
  if (level < LORD) return { label: "Lord", from: MIN_LEVEL, to: LORD };
  if (level < CHAMPION) return { label: "Champion", from: LORD, to: CHAMPION };
  return { label: "Max", from: CHAMPION, to: MAX_LEVEL };
}

/**
 * Proficiency points needed to go from `level` to `level + 1`.
 * Community-measured costs for the Season 6 track (the game does not publish
 * them); they are only used for time estimates.
 */
export function pointsToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0;
  if (level < 5) return 125;
  if (level < 10) return 240;
  if (level < 15) return 400;
  if (level < LORD) return 480;
  if (level < CHAMPION) return 1600;
  return 3100;
}

export function pointsBetween(from: number, to: number): number {
  let total = 0;
  for (let l = clampLevel(from); l < clampLevel(to); l++) total += pointsToNext(l);
  return total;
}

/**
 * Default earn rate. Guides put Lord (level 20, 6,100 points) at about
 * 20 hours on one hero, so about 320 points per hour of play.
 */
export const DEFAULT_POINTS_PER_HOUR = 320;
export const MIN_RATE = 60;
export const MAX_RATE = 1500;

export type Estimate = {
  /** Estimated current level, never below the level the player set. */
  level: number;
  /** Fraction (0 to 1) of the way to the next level. */
  fraction: number;
  /** Hours played on this hero since the level was last set. */
  hoursSince: number;
  /** Levels above the set level. */
  gained: number;
};

/**
 * Walk forward from the level the player set, spending points earned from
 * playtime logged since then.
 */
export function estimateLevel(
  setLevel: number,
  playtimeSinceSec: number,
  pointsPerHour: number = DEFAULT_POINTS_PER_HOUR,
): Estimate {
  const start = clampLevel(setLevel);
  const hoursSince = Math.max(0, playtimeSinceSec) / 3600;
  let points = hoursSince * pointsPerHour;
  let level = start;
  while (level < MAX_LEVEL && points >= pointsToNext(level)) {
    points -= pointsToNext(level);
    level++;
  }
  const cost = pointsToNext(level);
  return {
    level,
    fraction: cost ? points / cost : 0,
    hoursSince,
    gained: level - start,
  };
}

/** Hours of play from an estimate to a target level. */
export function hoursToLevel(
  est: { level: number; fraction: number },
  target: number,
  pointsPerHour: number = DEFAULT_POINTS_PER_HOUR,
): number {
  if (est.level >= target) return 0;
  const remaining =
    pointsBetween(est.level, target) - est.fraction * pointsToNext(est.level);
  return Math.max(0, remaining) / pointsPerHour;
}

/**
 * When a player corrects a level after playing, learn their real rate.
 * Returns undefined when the sample is too small to trust.
 */
export function observedRate(
  fromLevel: number,
  toLevel: number,
  playtimeSec: number,
): number | undefined {
  if (toLevel <= fromLevel || playtimeSec < 45 * 60) return undefined;
  const rate = pointsBetween(fromLevel, toLevel) / (playtimeSec / 3600);
  return Math.max(MIN_RATE, Math.min(MAX_RATE, rate));
}

/** Blend a new observation into the stored rate. */
export function blendRate(current: number | null | undefined, observed: number): number {
  const base = current ?? DEFAULT_POINTS_PER_HOUR;
  return Math.round(base * 0.6 + observed * 0.4);
}

export function formatHours(h: number): string {
  if (h <= 0) return "0h";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 10) return `${h.toFixed(1)}h`;
  return `${Math.round(h)}h`;
}
